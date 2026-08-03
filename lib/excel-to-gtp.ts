import ExcelJS from "exceljs";
import { GTPTable, GTPRow, GTPCell, GTPAlignment } from "@/types/gtp-types";

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
        const text = sanitizeXml(cellValueToString(cell.value));
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
          ...(fmt.wrapText ? { wrapText: true } : {}),
        });
      }

      // Skip fully blank rows (e.g. spacer rows some sheets have).
      if (cells.some((c) => c.text.trim() !== "")) {
        rows.push({ cells });
      }
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
  wrapText?: boolean;
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
  let wrapText = false;
  const cellAlignment = cell.alignment;
  if (cellAlignment) {
    wrapText = !!cellAlignment.wrapText;
    const h = cellAlignment.horizontal as GTPAlignment | undefined;
    if (h === "left" || h === "center" || h === "right" || h === "justify" || h === "distributed") {
      alignment = h;
    }
  }

  return { bold, fontSize, fontName, color, fill, alignment, wrapText };
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

function cellValueToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    // Rich text / hyperlink / formula result objects
    if ("richText" in value && Array.isArray((value as any).richText)) {
      return (value as any).richText.map((rt: any) => rt.text).join("");
    }
    if ("text" in value) return String((value as any).text);
    if ("result" in value) return String((value as any).result);
  }
  return String(value).trim();
}
