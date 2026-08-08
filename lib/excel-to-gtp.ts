import ExcelJS from "exceljs";
import {
  GTPTable, GTPRow, GTPCell, GTPAlignment, GTPVerticalAlign, GTPCellBorders,
} from "@/types/gtp-types";

/**
 * Parses every sheet in one Excel workbook into one GTPTable per sheet.
 * Handles merged cells by converting them to colspan/rowspan on the
 * top-left cell of the merge, and skipping the covered cells so they
 * don't render as empty duplicate <td>s.
 *
 * Formatting (bold, font size/name/color, alignment, fill) and the sheet's
 * real column widths are carried over so the generated docx keeps the
 * source sheet's look instead of being re-laid-out from scratch.
 */
export async function parseWorkbookToGTPTables(filePath: string): Promise<GTPTable[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const tables: GTPTable[] = [];

  workbook.eachSheet((worksheet) => {
    // Build a lookup of merge ranges: "row,col" (top-left) -> { rowspan, colspan }
    // and a set of "row,col" cells that are covered by a merge but NOT the
    // top-left cell (these get skipped entirely when building rows).
    const mergeInfo = new Map<string, { rowspan: number; colspan: number }>();
    const coveredCells = new Set<string>();

    // exceljs exposes merges as an array of range strings like "A1:D1"
    const merges: string[] = (worksheet as any).model?.merges ?? [];
    for (const range of merges) {
      const [startRef, endRef] = range.split(":");
      const start = worksheet.getCell(startRef);
      const end = worksheet.getCell(endRef);
      const startRow = parseInt(start.row, 10);
      const endRow = parseInt(end.row, 10);
      const startCol = parseInt(start.col, 10);
      const endCol = parseInt(end.col, 10);
      const rowspan = endRow - startRow + 1;
      const colspan = endCol - startCol + 1;
      mergeInfo.set(`${startRow},${startCol}`, { rowspan, colspan });

      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          if (r === startRow && c === startCol) continue;
          coveredCells.add(`${r},${c}`);
        }
      }
    }

    const rows: GTPRow[] = [];
    const colCount = worksheet.columnCount || 0;

    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: GTPCell[] = [];

      for (let colNumber = 1; colNumber <= colCount; colNumber++) {
        const key = `${rowNumber},${colNumber}`;
        if (coveredCells.has(key)) continue; // skip cells swallowed by a merge

        const cell = row.getCell(colNumber);
        const merge = mergeInfo.get(key);
        const text = sanitizeXml(cellValueToString(cell));
        const fmt = extractFormatting(cell);

        cells.push({
          text,
          ...(merge?.colspan && merge.colspan > 1 ? { colspan: merge.colspan } : {}),
          ...(merge?.rowspan && merge.rowspan > 1 ? { rowspan: merge.rowspan } : {}),
          ...(fmt.bold ? { bold: true } : {}),
          ...(fmt.fontSize ? { fontSize: fmt.fontSize } : {}),
          ...(fmt.fontName ? { fontName: fmt.fontName } : {}),
          ...(fmt.color ? { color: fmt.color } : {}),
          ...(fmt.fill ? { fill: fmt.fill } : {}),
          ...(fmt.alignment ? { alignment: fmt.alignment } : {}),
          ...(fmt.verticalAlign ? { verticalAlign: fmt.verticalAlign } : {}),
          ...(fmt.indent ? { indent: fmt.indent } : {}),
          ...(fmt.wrapText ? { wrapText: true } : {}),
          ...(Object.keys(fmt.borders).length > 0 ? { borders: fmt.borders } : {}),
        });
      }

      // Preserve every row exactly as in the sheet, including blank spacer rows.
      rows.push({ cells, ...(row.height && row.height > 0 ? { height: row.height } : {}) });
    });

    // Skip metadata-only sheets (e.g. a sheet that just holds "UTILITY:" /
    // "RC NO.:" rows with no GTP table content). A real GTP sheet always has
    // at least 3 rows with data and a handful of populated cells.
    let nonEmptyCells = 0;
    for (const row of rows) {
      for (const cell of row.cells) {
        if (cell.text.trim() !== "") nonEmptyCells++;
      }
    }
    if (rows.length < 3 || nonEmptyCells < 5) return;

    tables.push({
      sheetName: worksheet.name,
      sourceFile: fileName,
      rows,
      columnWidths: readColumnWidths(worksheet, colCount),
    });
  });

  return tables;
}

/** Parses multiple workbooks and flattens all their sheets into one ordered list of tables. */
export async function parseWorkbooksToGTPTables(filePaths: string[]): Promise<GTPTable[]> {
  const all: GTPTable[] = [];
  for (const filePath of filePaths) {
    const tables = await parseWorkbookToGTPTables(filePath);
    all.push(...tables);
  }
  return all;
}

function readColumnWidths(worksheet: ExcelJS.Worksheet, colCount: number): number[] {
  const widths: number[] = [];
  for (let c = 1; c <= colCount; c++) {
    const width = worksheet.getColumn(c).width;
    widths.push(typeof width === "number" && width > 0 ? width : 10);
  }
  return widths;
}

interface CellFormatting {
  bold: boolean;
  fontSize?: number;
  fontName?: string;
  color?: string;
  fill?: string;
  alignment?: GTPAlignment;
  verticalAlign?: GTPVerticalAlign;
  indent?: number;
  wrapText?: boolean;
  borders: GTPCellBorders;
}

function extractFormatting(cell: ExcelJS.Cell): CellFormatting {
  const font = cell.font;
  let bold = !!font?.bold;
  let fontSize: number | undefined;
  let fontName: string | undefined;
  let color: string | undefined;

  if (font) {
    if (font.size) fontSize = font.size;
    if (font.name) fontName = font.name;
    if (font.color?.argb) color = normalizeColor(font.color.argb);
  }

  // Rich text: bold may live on individual runs rather than the cell font.
  if (typeof cell.value === "object" && cell.value !== null) {
    const richText = (cell.value as { richText?: Array<{ font?: ExcelJS.Font }> }).richText;
    if (Array.isArray(richText) && richText.length > 0) {
      if (!bold) bold = richText.some((rt) => rt.font?.bold);
      if (!fontSize && richText[0].font?.size) fontSize = richText[0].font.size;
      if (!fontName && richText[0].font?.name) fontName = richText[0].font.name;
      if (!color && richText[0].font?.color?.argb) color = normalizeColor(richText[0].font.color.argb);
    }
  }

  let fill: string | undefined;
  const cellFill = cell.fill as { type?: string; pattern?: string; fgColor?: { argb?: string } } | undefined;
  if (cellFill && cellFill.type === "pattern" && cellFill.pattern === "solid" && cellFill.fgColor?.argb) {
    fill = normalizeColor(cellFill.fgColor.argb);
  }

  let alignment: GTPAlignment | undefined;
  let verticalAlign: GTPVerticalAlign | undefined;
  let indent: number | undefined;
  let wrapText = false;
  const cellAlignment = cell.alignment;
  if (cellAlignment) {
    wrapText = !!cellAlignment.wrapText;
    const h = cellAlignment.horizontal as GTPAlignment | undefined;
    if (h === "left" || h === "center" || h === "right" || h === "justify" || h === "distributed") {
      alignment = h;
    }
    const v = cellAlignment.vertical;
    if (v === "top") verticalAlign = "top";
    else if (v === "bottom") verticalAlign = "bottom";
    else if (v) verticalAlign = "middle"; // middle / justify / distributed
    if (typeof cellAlignment.indent === "number" && cellAlignment.indent > 0) {
      indent = cellAlignment.indent;
    }
  }

  const borders: GTPCellBorders = {};
  const cellBorder = cell.border as {
    top?: { style?: string; color?: { argb?: string } };
    left?: { style?: string; color?: { argb?: string } };
    bottom?: { style?: string; color?: { argb?: string } };
    right?: { style?: string; color?: { argb?: string } };
  } | undefined;
  if (cellBorder) {
    for (const side of ["top", "left", "bottom", "right"] as const) {
      const b = cellBorder[side];
      if (b && b.style) {
        borders[side] = {
          style: b.style,
          ...(b.color?.argb ? { color: normalizeColor(b.color.argb) } : {}),
        };
      }
    }
  }

  return { bold, fontSize, fontName, color, fill, alignment, verticalAlign, indent, wrapText, borders };
}

/** Accepts "FFAABBCC" or "AABBCC"; strips the alpha prefix when 8 hex chars. */
function normalizeColor(argb: string): string {
  const hex = argb.replace(/^#/, "");
  if (/^[0-9a-fA-F]{8}$/.test(hex)) return hex.slice(2);
  return hex;
}

function sanitizeXml(s: string): string {
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, "");
}

/**
 * Returns a cell's display text as shown in Excel, honoring its number/date
 * format (`cell.numFmt`). exceljs's `cell.text` does not apply number formats,
 * so numbers and dates are formatted here for the common GTP patterns.
 */
function cellValueToString(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";

  // Unwrap cached formula results so their numFmt applies to the result.
  let resolved: unknown = value;
  if (
    typeof value === "object" &&
    "result" in value &&
    !("richText" in value) &&
    !("text" in value)
  ) {
    resolved = (value as { result: unknown }).result;
  }

  const numFmt = cell.numFmt && cell.numFmt !== "General" ? cell.numFmt : undefined;

  if (typeof resolved === "number") {
    return numFmt ? formatNumber(resolved, numFmt) : String(resolved);
  }
  if (resolved instanceof Date) {
    return numFmt ? formatDate(resolved, numFmt) : resolved.toDateString();
  }
  if (typeof resolved === "boolean") return resolved ? "TRUE" : "FALSE";
  if (typeof resolved === "string") return resolved.trim();
  if (typeof resolved === "object" && resolved !== null) {
    if ("richText" in resolved && Array.isArray((resolved as any).richText)) {
      return (resolved as any).richText.map((rt: any) => rt.text).join("");
    }
    if ("text" in resolved) return String((resolved as any).text);
    if ("result" in resolved) return String((resolved as any).result);
  }
  return String(resolved).trim();
}

/** Formats a numeric cell value for common Excel number formats. */
function formatNumber(value: number, numFmt: string): string {
  const section = numFmt.split(";")[0].replace(/\[[^\]]*\]/g, "").replace(/\*/g, "");
  const literals: string[] = [];
  const withPlaceholders = section.replace(/"([^"]+)"/g, (_m: string, lit: string) => {
    literals.push(lit);
    return "\u0001";
  });

  const match = withPlaceholders.match(/^([^#0]*)([#0][#,0]*\.?[#0]*)(.*)$/);
  if (!match) return String(value);

  const prefix = match[1];
  const numPart = match[2];
  const suffix = match[3];
  const isPercent = /%/.test(suffix);
  const hasThousands = numPart.includes(",");
  const dotIdx = numPart.indexOf(".");
  const decimals = dotIdx >= 0 ? numPart.length - dotIdx - 1 : 0;
  const stripTrailingZeros = dotIdx >= 0 && numPart.slice(dotIdx).includes("#");

  let n = isPercent ? value * 100 : value;
  let s = n.toFixed(decimals);
  if (stripTrailingZeros && decimals > 0) {
    s = s.replace(/\.?0+$/, "");
  }
  if (hasThousands) {
    const neg = s.startsWith("-");
    const abs = neg ? s.slice(1) : s;
    const [int, dec] = abs.split(".");
    s = (neg ? "-" : "") +
      int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
      (dec !== undefined ? "." + dec : "");
  }

  let out = prefix + s + suffix;
  for (const literal of literals) {
    out = out.replace("\u0001", literal);
  }
  return out;
}

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/** Formats a date cell value for common Excel date/time formats. */
function formatDate(value: Date, numFmt: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const hasHour = /h/i.test(numFmt);
  const out = numFmt
    .replace(/yyyy/g, () => String(value.getFullYear()))
    .replace(/yy/g, () => pad(value.getFullYear() % 100))
    .replace(/dddd/g, () => DAYS_FULL[value.getDay()])
    .replace(/ddd/g, () => DAYS_FULL[value.getDay()].slice(0, 3))
    .replace(/dd/g, () => pad(value.getDate()))
    .replace(/d/g, () => String(value.getDate()))
    .replace(/mmmm/g, () => MONTHS_FULL[value.getMonth()])
    .replace(/mmm/g, () => MONTHS_FULL[value.getMonth()].slice(0, 3))
    .replace(/mm/g, () => (hasHour ? pad(value.getMinutes()) : pad(value.getMonth() + 1)))
    .replace(/m/g, () => (hasHour ? String(value.getMinutes()) : String(value.getMonth() + 1)))
    .replace(/hh/g, () => pad(value.getHours()))
    .replace(/h/g, () => String(value.getHours()))
    .replace(/ss/g, () => pad(value.getSeconds()))
    .replace(/s/g, () => String(value.getSeconds()))
    .replace(/AM\/PM/g, () => (value.getHours() < 12 ? "AM" : "PM"))
    .replace(/A\/P/g, () => (value.getHours() < 12 ? "A" : "P"));
  return out;
}
