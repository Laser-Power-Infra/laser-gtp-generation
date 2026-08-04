import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, PageBreak, Header, Footer, ImageRun,
  TableLayoutType, convertInchesToTwip, SimpleField, VerticalAlign,
} from "docx";
import type { GTPDocumentData, GTPTable, GTPRow, GTPCell } from "@/types/gtp-types";
import { applyLetterheadFooter } from "./apply-letterhead-footer";
import fs from "fs";
import path from "path";

export type PageOrientation = "portrait" | "landscape";

export interface RenderDocxOptions {
  /** Page orientation for the whole document. Defaults to "portrait". */
  orientation?: PageOrientation;
  /**
   * Whether to render the OWNER / PROJECT / CONTRACTOR / LOI NO. title block
   * in the page header. Defaults to true.
   */
  showTitleBlock?: boolean;
}

const BORDER = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: "000000",
};

const CELL_MARGINS = { top: 40, bottom: 40, left: 80, right: 80 };

const FONT_SIZE = 18; // 9pt in half-points

const PAGE_SIZE = { width: 11906, height: 16838 }; // A4 portrait twips

const PAGE_MARGIN = {
  top: convertInchesToTwip(1),
  right: convertInchesToTwip(0.4),
  bottom: 1134, // 0.79", matching the letterhead
  left: convertInchesToTwip(0.4),
  footer: 0, // sit the letterhead footer flush at the page bottom
};

interface RowspanEntry {
  startCol: number;
  colSpan: number;
  remaining: number;
}

interface DeferredRowspan {
  startCol: number;
  colSpan: number;
  /** Continuation rows left below the original start row. */
  remaining: number;
  cell: GTPCell;
}

/**
 * Number of top rows that make up the sheet's header block (title, size
 * labels, column headers). These rows are repeated on every page, so they
 * must not contain vertical merges.
 */
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

type DocxAlignment = "left" | "center" | "right" | "both" | "distribute";

function buildParagraph(
  text: string,
  options?: {
    bold?: boolean;
    alignment?: DocxAlignment;
    fontSize?: number; // half-points
    color?: string;
    font?: string;
  }
): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: options?.bold,
        size: options?.fontSize ?? FONT_SIZE,
        color: options?.color,
        font: options?.font,
      }),
    ],
    alignment: options?.alignment,
    spacing: { before: 0, after: 0 },
  });
}

function buildPageBreak(): Paragraph {
  return new Paragraph({
    children: [new PageBreak()],
    spacing: { before: 0, after: 0 },
  });
}

function getTableColumnCount(gtpTable: GTPTable): number {
  let max = 0;
  for (const row of gtpTable.rows) {
    let cols = 0;
    for (const cell of row.cells) {
      cols += cell.colspan || 1;
    }
    max = Math.max(max, cols);
  }
  return max;
}

/**
 * Derives column widths in twips. Uses the source sheet's real column widths
 * (which the authors tuned to fit the content) as the base, then enforces a
 * content-aware minimum so header text / section labels don't get crushed.
 * The final widths are normalized to fill the printable page width exactly.
 */
function calculateColumnWidthsInTwips(gtpTable: GTPTable, printableWidth: number): number[] {
  const colCount = getTableColumnCount(gtpTable);
  if (colCount === 0) return [];

  const headerRowCount = computeHeaderRowCount(gtpTable);

  // Base: proportional to the source sheet's real column widths.
  let base: number[];
  if (Array.isArray(gtpTable.columnWidths) && gtpTable.columnWidths.length >= colCount) {
    const ws = gtpTable.columnWidths.slice(0, colCount);
    const tot = ws.reduce((s, w) => s + (w > 0 ? w : 0), 0);
    base = ws.map((w) => Math.round(((w > 0 ? w : 1) / tot) * printableWidth));
  } else {
    base = new Array(colCount).fill(Math.round(printableWidth / colCount));
  }

  // Content minimum from the header block + first data row (holds the
  // vertically-merged section labels like "4. GENERAL TECHNICAL REQUIREMENTS").
  const content = new Array(colCount).fill(0);
  const scan = gtpTable.rows.slice(0, Math.min(gtpTable.rows.length, headerRowCount + 1));
  for (const row of scan) {
    let ci = 0;
    for (const cell of row.cells) {
      const span = cell.colspan || 1;
      const len = cell.text ? cell.text.length : 0;
      if (len > 0) {
        if (span === 1) {
          content[ci] = Math.max(content[ci], len);
        } else {
          const per = Math.ceil(len / span);
          for (let i = 0; i < span && ci + i < colCount; i++) {
            content[ci + i] = Math.max(content[ci + i], per);
          }
        }
      }
      ci += span;
    }
  }

  const CHAR_TWIP = 60; // approx twips per average char at 9pt
  const MIN_COL = 300; // floor so header text like "Sl. No." stays readable
  const CONTENT_CAP = 1400; // max extra width a single cell can demand

  let widths = base.map((b, i) => Math.max(b, Math.min(content[i] * CHAR_TWIP, CONTENT_CAP)));
  widths = widths.map((w) => Math.max(MIN_COL, w));

  // Normalize the total to exactly the printable width.
  let total = widths.reduce((a, b) => a + b, 0);
  if (total > printableWidth) {
    const overage = total - printableWidth;
    const heavyIdx = widths.map((w, i) => (w > MIN_COL ? i : -1)).filter((i) => i >= 0);
    const heavyTotal = heavyIdx.reduce((a, i) => a + widths[i], 0);
    if (heavyTotal > 0 && heavyTotal > overage) {
      const factor = (heavyTotal - overage) / heavyTotal;
      for (const i of heavyIdx) widths[i] = Math.round(widths[i] * factor);
    }
  }
  total = widths.reduce((a, b) => a + b, 0);
  const diff = printableWidth - total;
  if (diff !== 0) {
    const maxIdx = widths.indexOf(Math.max(...widths));
    widths[maxIdx] = Math.max(MIN_COL, widths[maxIdx] + diff);
  }

  return widths;
}

function cellAlignment(gtpCell: GTPCell, columnSpan: number): DocxAlignment | undefined {
  if (gtpCell.alignment === "justify") return "both";
  if (gtpCell.alignment === "distributed") return "distribute";
  if (gtpCell.alignment) return gtpCell.alignment;
  if (columnSpan > 1) return "center";
  return undefined;
}

function buildCell(
  gtpCell: GTPCell,
  options?: { verticalMerge?: "restart" | "continue"; columnSpan?: number; widthTwip?: number }
): TableCell {
  const span = options?.columnSpan ?? gtpCell.colspan ?? 1;
  const fontSize = gtpCell.fontSize ? Math.round(gtpCell.fontSize * 2) : FONT_SIZE;

  return new TableCell({
    children: [
      buildParagraph(gtpCell.text, {
        bold: gtpCell.bold,
        fontSize,
        alignment: cellAlignment(gtpCell, span),
        color: gtpCell.color,
        font: gtpCell.fontName,
      }),
    ],
    columnSpan: span > 1 ? span : undefined,
    verticalMerge: options?.verticalMerge,
    shading: gtpCell.fill ? { type: "clear", fill: gtpCell.fill } : undefined,
    borders: {
      top: BORDER,
      bottom: BORDER,
      left: BORDER,
      right: BORDER,
    },
    margins: CELL_MARGINS,
    width: options?.widthTwip
      ? { size: options.widthTwip, type: WidthType.DXA }
      : undefined,
  });
}

function buildContinuationCell(colSpan: number, widthTwip?: number): TableCell {
  return new TableCell({
    children: [buildParagraph("")],
    columnSpan: colSpan > 1 ? colSpan : undefined,
    verticalMerge: "continue",
    borders: {
      top: BORDER,
      bottom: BORDER,
      left: BORDER,
      right: BORDER,
    },
    margins: CELL_MARGINS,
    width: widthTwip
      ? { size: widthTwip, type: WidthType.DXA }
      : undefined,
  });
}

function buildRows(gtpTable: GTPTable, colWidths: number[]): TableRow[] {
  const columnCount = getTableColumnCount(gtpTable);
  const headerRowCount = computeHeaderRowCount(gtpTable);
  const active: RowspanEntry[] = [];
  const deferred: DeferredRowspan[] = [];
  const rows: TableRow[] = [];

  const sumWidth = (startCol: number, span: number): number => {
    let twip = 0;
    for (let i = 0; i < span; i++) {
      if (startCol + i < colWidths.length) twip += colWidths[startCol + i];
    }
    return twip;
  };

  for (let rowIndex = 0; rowIndex < gtpTable.rows.length; rowIndex++) {
    const gtpRow = gtpTable.rows[rowIndex];
    const isHeaderRow = rowIndex < headerRowCount;
    const cells: TableCell[] = [];
    let colIdx = 0;
    let cellIdx = 0;

    while (colIdx < columnCount) {
      const entry = active.find(
        (e) => colIdx >= e.startCol && colIdx < e.startCol + e.colSpan
      );

      if (entry) {
        cells.push(buildContinuationCell(entry.colSpan, sumWidth(colIdx, entry.colSpan)));
        colIdx += entry.colSpan;
        entry.remaining--;
        continue;
      }

      // Start deferred merges at the first non-header row.
      const dIdx = deferred.findIndex((d) => d.startCol === colIdx);
      if (dIdx >= 0) {
        const d = deferred[dIdx];
        deferred.splice(dIdx, 1);
        cells.push(
          buildCell(d.cell, { verticalMerge: "restart", widthTwip: sumWidth(colIdx, d.colSpan) })
        );
        active.push({ startCol: d.startCol, colSpan: d.colSpan, remaining: d.remaining - 1 });
        colIdx += d.colSpan;
        continue;
      }

      if (cellIdx < gtpRow.cells.length) {
        const gtpCell = gtpRow.cells[cellIdx];
        const cellSpan = gtpCell.colspan || 1;

        if (gtpCell.rowspan && gtpCell.rowspan > 1) {
          if (isHeaderRow) {
            // Header rows must stay free of vertical merges so Word repeats
            // them. Defer the merge to the first data row below the header.
            deferred.push({
              startCol: colIdx,
              colSpan: cellSpan,
              remaining: gtpCell.rowspan - 1,
              cell: gtpCell,
            });
            cells.push(
              buildCell({ ...gtpCell, text: "", rowspan: undefined }, { widthTwip: sumWidth(colIdx, cellSpan) })
            );
          } else {
            active.push({ startCol: colIdx, colSpan: cellSpan, remaining: gtpCell.rowspan - 1 });
            cells.push(
              buildCell(gtpCell, { verticalMerge: "restart", widthTwip: sumWidth(colIdx, cellSpan) })
            );
          }
        } else {
          cells.push(buildCell(gtpCell, { widthTwip: sumWidth(colIdx, cellSpan) }));
        }

        colIdx += cellSpan;
        cellIdx++;
        continue;
      }

      // Trailing gap with no source cell: keep header rows merge-free.
      cells.push(
        isHeaderRow
          ? buildCell({ text: "" }, { widthTwip: sumWidth(colIdx, 1) })
          : buildContinuationCell(1, sumWidth(colIdx, 1))
      );
      colIdx++;
    }

    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].remaining <= 0) {
        active.splice(i, 1);
      }
    }

    rows.push(
      new TableRow({
        children: cells,
        tableHeader: isHeaderRow ? true : undefined,
      })
    );
  }

  return rows;
}

function buildTable(gtpTable: GTPTable, printableWidth: number): Table {
  const colWidths = calculateColumnWidthsInTwips(gtpTable, printableWidth);
  return new Table({
    rows: buildRows(gtpTable, colWidths),
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: colWidths,
  });
}

function createHeaderTable(data: GTPDocumentData): Table {
  const makeRow = (label: string, value: string): TableRow =>
    new TableRow({
      children: [
        new TableCell({
          children: [buildParagraph(label, { bold: true })],
          borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
          margins: CELL_MARGINS,
          width: { size: 18, type: WidthType.PERCENTAGE },
          shading: { type: "clear", fill: "F2F2F2" },
        }),
        new TableCell({
          children: [buildParagraph(value)],
          borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
          margins: CELL_MARGINS,
        }),
      ],
    });

  return new Table({
    rows: [
      makeRow("OWNER", data.owner),
      makeRow("PROJECT", data.project),
      makeRow("CONTRACTOR", data.contractor),
      makeRow("LOI NO.", data.loiNo),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

export async function renderDocx(
  data: GTPDocumentData,
  options: RenderDocxOptions = {}
): Promise<Buffer> {
  const orientation: PageOrientation = options.orientation ?? "portrait";
  // The docx lib swaps width/height when orientation is landscape; pass the
  // portrait A4 dims and compute the printable width from the long side.
  const printableWidth =
    (orientation === "landscape" ? PAGE_SIZE.height : PAGE_SIZE.width) -
    PAGE_MARGIN.left -
    PAGE_MARGIN.right;

  const children: (Paragraph | Table)[] = [];

  const logoBuffer = fs.readFileSync(path.join(process.cwd(), "public", "laser-logo.jpeg"));
  const footerDetailsBuffer = fs.readFileSync(path.join(process.cwd(), "public", "footer-company-details.jpeg"));
  const signatureBuffer = fs.readFileSync(path.join(process.cwd(), "public", "puja-mam-signature.jpeg"));

  for (let i = 0; i < data.tables.length; i++) {
    if (i > 0) {
      children.push(buildPageBreak());
    }

    children.push(buildTable(data.tables[i], printableWidth));
  }

  const HEADER_BORDER = {
    style: BorderStyle.SINGLE,
    size: 4, // 1/2 pt
    color: "CCCCCC",
  };

  const companyHeaderTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "LASER POWER AND INFRA LIMITED",
                    bold: true,
                    size: 32, // 16pt
                    color: "FFA3A3",
                    font: "Georgia",
                  }),
                ],
                spacing: { before: 0, after: 40 },
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Kolkata, West Bengal India; info@laserpowerinfra.com",
                    size: 20, // 10pt
                    color: "0047AB",
                    font: "Arial",
                  }),
                ],
                spacing: { before: 0, after: 0 },
              }),
            ],
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            width: { size: 72, type: WidthType.PERCENTAGE },
            borders: {
              top: HEADER_BORDER,
              bottom: HEADER_BORDER,
              left: HEADER_BORDER,
              right: HEADER_BORDER,
            },
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new ImageRun({
                    data: logoBuffer,
                    type: "jpg",
                    transformation: { width: 160, height: 64 },
                  }),
                ],
                alignment: "center",
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 60, bottom: 60, left: 60, right: 60 },
            width: { size: 28, type: WidthType.PERCENTAGE },
            borders: {
              top: HEADER_BORDER,
              bottom: HEADER_BORDER,
              left: HEADER_BORDER,
              right: HEADER_BORDER,
            },
          }),
        ],
      }),
    ],
  });

  const headerChildren: (Paragraph | Table)[] = [
    companyHeaderTable,
    new Paragraph({
      spacing: { before: 120, after: 0 },
    }),
  ];
  if (options.showTitleBlock !== false) {
    headerChildren.push(createHeaderTable(data));
  }

  const header = new Header({
    children: headerChildren,
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        children: [
          new ImageRun({
            data: signatureBuffer,
            type: "jpg",
            transformation: { width: 148, height: 78 },
          }),
        ],
        alignment: "right",
        spacing: { before: 0, after: 60 },
      }),
      new Paragraph({
        children: [
          new ImageRun({
            data: footerDetailsBuffer,
            type: "jpg",
            transformation: { width: 730, height: 93 },
          }),
        ],
        alignment: "center",
        spacing: { before: 0, after: 60 },
      }),
      new Paragraph({
        children: [
          new SimpleField(" PAGE "),
          new TextRun({ text: " of " }),
          new SimpleField(" NUMPAGES "),
        ],
        alignment: "center",
        spacing: { before: 60, after: 0 },
      }),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: PAGE_SIZE.width,
              height: PAGE_SIZE.height,
              orientation,
            },
            margin: PAGE_MARGIN,
            borders: {
              pageBorders: { display: "allPages", offsetFrom: "page" },
              pageBorderTop: { style: "single", size: 12, color: "FF0000", space: 8 },
              pageBorderBottom: { style: "single", size: 12, color: "FF0000", space: 8 },
              pageBorderLeft: { style: "single", size: 12, color: "FF0000", space: 8 },
              pageBorderRight: { style: "single", size: 12, color: "FF0000", space: 8 },
            },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  const pageWidthTwips =
    orientation === "landscape" ? PAGE_SIZE.height : PAGE_SIZE.width;

  return applyLetterheadFooter(buffer, pageWidthTwips);
}
