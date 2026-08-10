import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import type {
  GTPDocumentData,
  GTPTable,
  GTPRow,
  GTPCell,
  GTPBorderSide,
} from "@/types/gtp-types";

export interface GenerateGtpPdfOptions {
  /** Output path to write the PDF to. */
  outputPath: string;
  orientation?: "portrait" | "landscape";
  titleBlockMode?: "standard" | "custom" | "none";
  titleBlockCustomRows?: { label: string; value: string }[];
  /** Directory containing gtp_template.hbs / gtp_header.hbs / gtp_footer.hbs. Defaults to project root. */
  templateDir?: string;
  /** Override the Chrome executable path. Defaults to installed Chrome, then Puppeteer's bundled Chromium. */
  executablePath?: string;
}

interface RenderableCell {
  text: string;
  style: string;
  colspan?: number;
  rowspan?: number;
}

interface RenderableRow {
  cells: RenderableCell[];
  height?: number;
}

/**
 * Cap for a row's declared height (points). The source sheets sometimes carry
 * very large explicit row heights (up to ~400pt) which force each such row to
 * occupy most of a page and fragment the layout into near-blank pages. Rows use
 * min-height in CSS, so content that is actually taller still grows; this only
 * removes the oversized forced minimums.
 */
const MAX_ROW_HEIGHT_POINTS = 40;

interface RenderableTable {
  sheetName: string;
  headerRows: RenderableRow[];
  bodyRows: RenderableRow[];
}

const WINDOWS_CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Chromium\\Application\\chrome.exe",
];

async function resolveChromePath(override?: string): Promise<string | undefined> {
  if (override) return override;
  const found = WINDOWS_CHROME_PATHS.find((p) => fs.existsSync(p));
  if (found) return found;
  return puppeteer.executablePath();
}

/** Maps an Excel border style name to a CSS border declaration. */
const CSS_BORDER_MAP: Record<string, { style: string; width: string }> = {
  hair: { style: "solid", width: "0.5px" },
  dotted: { style: "dotted", width: "1px" },
  dashed: { style: "dashed", width: "1.5px" },
  thin: { style: "solid", width: "1px" },
  dashDot: { style: "dashed", width: "1px" },
  dashDotDot: { style: "dashed", width: "1px" },
  medium: { style: "solid", width: "2px" },
  mediumDashed: { style: "dashed", width: "2px" },
  mediumDashDot: { style: "dashed", width: "2px" },
  mediumDashDotDot: { style: "dashed", width: "2px" },
  slantDashDot: { style: "dashed", width: "2px" },
  thick: { style: "solid", width: "3px" },
  double: { style: "double", width: "3px" },
};

function toCssBorder(side?: GTPBorderSide): string | undefined {
  if (!side?.style) return undefined;
  const mapped = CSS_BORDER_MAP[side.style] ?? { style: "solid", width: "1px" };
  return `${mapped.width} ${mapped.style} ${side.color ? "#" + side.color : "#000000"}`;
}

/** Builds the inline style string for a table cell, mirroring the docx renderer. */
function buildCellStyle(cell: GTPCell, widthPct?: number): string {
  const parts: string[] = ["padding: 0 1pt;"];

  const top = toCssBorder(cell.borders?.top);
  if (top) parts.push(`border-top: ${top};`);
  const left = toCssBorder(cell.borders?.left);
  if (left) parts.push(`border-left: ${left};`);
  const bottom = toCssBorder(cell.borders?.bottom);
  if (bottom) parts.push(`border-bottom: ${bottom};`);
  const right = toCssBorder(cell.borders?.right);
  if (right) parts.push(`border-right: ${right};`);

  if (cell.bold) parts.push("font-weight: bold;");
  if (cell.fontSize) parts.push(`font-size: ${cell.fontSize}pt;`);
  if (cell.color) parts.push(`color: #${cell.color};`);
  if (cell.fill) parts.push(`background-color: #${cell.fill};`);

  const align = cell.alignment === "distributed" ? "justify" : cell.alignment;
  if (align) parts.push(`text-align: ${align};`);

  const vAlign = cell.verticalAlign === "middle" ? "middle" : cell.verticalAlign;
  if (vAlign) parts.push(`vertical-align: ${vAlign};`);

  if (cell.indent) parts.push(`padding-left: ${Math.round(cell.indent * 9)}pt;`);
  if (widthPct) parts.push(`width: ${widthPct.toFixed(2)}%;`);

  return parts.join(" ");
}

function getTableColumnCount(gtpTable: GTPTable): number {
  let max = 0;
  for (const row of gtpTable.rows) {
    let cols = 0;
    for (const cell of row.cells) cols += cell.colspan || 1;
    max = Math.max(max, cols);
  }
  return max;
}

/** Normalized per-column widths (percentage of total), preserving source proportions. */
function columnWidthPcts(gtpTable: GTPTable): number[] {
  const colCount = getTableColumnCount(gtpTable);
  if (colCount === 0) return [];
  const widths =
    Array.isArray(gtpTable.columnWidths) && gtpTable.columnWidths.length >= colCount
      ? gtpTable.columnWidths.slice(0, colCount).map((w) => (w > 0 ? w : 10) * 105 + 75)
      : new Array<number>(colCount).fill(1);
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  return widths.map((w) => (w / total) * 100);
}

/** Number of top rows that make up the sheet header block (repeated on every page). */
function computeHeaderRowCount(gtpTable: GTPTable): number {
  let count = 0;
  for (let i = 0; i < gtpTable.rows.length; i++) {
    const isHeader =
      i === 0 ||
      (i < 3 && gtpTable.rows[i].cells.every((cell) => cell.text.trim() === "" || cell.bold));
    if (!isHeader) break;
    count = i + 1;
  }
  return count;
}

function toRenderableTable(gtpTable: GTPTable): RenderableTable {
  const pcts = columnWidthPcts(gtpTable);
  const headerRowCount = computeHeaderRowCount(gtpTable);

  const renderRow = (row: GTPRow, isHeader: boolean): RenderableRow => {
    const cells: RenderableCell[] = [];
    let colIdx = 0;
    for (const cell of row.cells) {
      const span = cell.colspan || 1;
      let pct = 0;
      for (let i = 0; i < span; i++) {
        if (colIdx + i < pcts.length) pct += pcts[colIdx + i];
      }
      cells.push({
        text: cell.text,
        style: buildCellStyle(cell, pct),
        ...(span > 1 ? { colspan: span } : {}),
        // rowspan must not cross the thead/tbody boundary, so header rows lose it.
        ...(!isHeader && cell.rowspan && cell.rowspan > 1 ? { rowspan: cell.rowspan } : {}),
      });
      colIdx += span;
    }
    return {
      cells,
      ...(row.height && row.height > 0 ? { height: Math.min(row.height, MAX_ROW_HEIGHT_POINTS) } : {}),
    };
  };

  const rows = gtpTable.rows.map((r, i) => renderRow(r, i < headerRowCount));
  return {
    sheetName: gtpTable.sheetName,
    headerRows: rows.slice(0, headerRowCount),
    bodyRows: rows.slice(headerRowCount),
  };
}

function buildTitleBlockRows(
  data: GTPDocumentData,
  options: GenerateGtpPdfOptions
): { label: string; value: string }[] {
  if (options.titleBlockMode === "none") return [];
  if (options.titleBlockMode === "custom") {
    return (options.titleBlockCustomRows ?? [])
      .filter((r) => r.label.trim() !== "")
      .map((r) => ({ label: r.label, value: r.value ?? "" }));
  }
  return [
    { label: "OWNER", value: data.owner },
    { label: "PROJECT", value: data.project },
    { label: "CONTRACTOR", value: data.contractor },
    { label: "LOI NO.", value: data.loiNo },
  ];
}

function dataUri(relPath: string, mime: string): string {
  const buf = fs.readFileSync(path.join(process.cwd(), relPath));
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Renders the GTP document to a PDF via Puppeteer + Handlebars.
 * The company header + title block repeat on every page (headerTemplate),
 * and the signature / company bar / page numbers repeat in the footer.
 */
export async function generateGtpPdf(
  data: GTPDocumentData,
  options: GenerateGtpPdfOptions
): Promise<Buffer> {
  const templateDir = options.templateDir ?? process.cwd();
  const read = (name: string) => fs.readFileSync(path.join(templateDir, name), "utf-8");
  const bodySource = read("gtp_template.hbs");
  const headerSource = read("gtp_header.hbs");
  const footerSource = read("gtp_footer.hbs");

  const orientation = options.orientation === "landscape" ? "landscape" : "portrait";
  const pageWidthPx = orientation === "landscape" ? 1123 : 794; // A4 at 96dpi
  const marginLR = 38.4; // 0.4in
  const contentWidthPx = Math.round(pageWidthPx - marginLR * 2);

  const renderableTables = data.tables.map(toRenderableTable);
  const titleBlockRows = buildTitleBlockRows(data, options);

  const logoBase64 = dataUri("public/laser-logo.jpeg", "image/jpeg");
  const signatureBase64 = dataUri("public/puja-mam-signature.jpeg", "image/jpeg");
  const footerDetailsBase64 = dataUri("public/footer-company-details.jpeg", "image/jpeg");

  const FOOTER_BAR_W = 730;
  const FOOTER_BAR_H = 93;
  const barScale = Math.min(1, contentWidthPx / FOOTER_BAR_W);
  const footerBarWidthPx = Math.round(FOOTER_BAR_W * barScale);
  const footerBarHeightPx = Math.round(FOOTER_BAR_H * barScale);

  const common = {
    contentWidthPx,
    logoBase64,
    signatureBase64,
    footerDetailsBase64,
    footerBarWidthPx,
    footerBarHeightPx,
  };

  const bodyTemplate = Handlebars.compile(bodySource);
  const headerTemplate = Handlebars.compile(headerSource);
  const footerTemplate = Handlebars.compile(footerSource);

  const bodyHtml = bodyTemplate({ ...common, tables: renderableTables });
  const headerHtml = headerTemplate({ ...common, titleBlockRows });
  const footerHtml = footerTemplate(common);

  const footerHeightPx = Math.round(78 + 8 + footerBarHeightPx + 10 + 26 + 14);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: await resolveChromePath(options.executablePath),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    await page.setContent(
      `<style>html,body{margin:0;padding:0;}</style><div id="probe" style="width:${contentWidthPx}px;">${headerHtml}</div>`,
      { waitUntil: "load" }
    );
    await page.evaluateHandle("document.fonts.ready");
    const headerHeightPx = Math.ceil(
      await page.evaluate(() => document.getElementById("probe")?.getBoundingClientRect().height ?? 0)
    );

    await page.setContent(bodyHtml, { waitUntil: "load" });
    await page.evaluateHandle("document.fonts.ready");

    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: orientation === "landscape",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: headerHtml,
      footerTemplate: footerHtml,
      margin: {
        top: `${headerHeightPx + 24}px`,
        bottom: `${footerHeightPx}px`,
        left: `${marginLR}px`,
        right: `${marginLR}px`,
      },
    });

    fs.writeFileSync(options.outputPath, pdfBuffer);
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
