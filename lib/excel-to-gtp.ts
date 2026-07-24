import ExcelJS from "exceljs";
import { GTPTable, GTPRow, GTPCell } from "@/types/gtp-types";

/**
 * Parses every sheet in one Excel workbook into one GTPTable per sheet.
 * Handles merged cells by converting them to colspan/rowspan on the
 * top-left cell of the merge, and skipping the covered cells so they
 * don't render as empty duplicate <td>s.
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

    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: GTPCell[] = [];
      const colCount = worksheet.columnCount || row.cellCount;

      for (let colNumber = 1; colNumber <= colCount; colNumber++) {
        const key = `${rowNumber},${colNumber}`;
        if (coveredCells.has(key)) continue; // skip cells swallowed by a merge

        const cell = row.getCell(colNumber);
        const merge = mergeInfo.get(key);
        const text = sanitizeXml(cellValueToString(cell.value));
        const bold = !!cell.font?.bold;

        cells.push({
          text,
          ...(merge?.colspan && merge.colspan > 1 ? { colspan: merge.colspan } : {}),
          ...(merge?.rowspan && merge.rowspan > 1 ? { rowspan: merge.rowspan } : {}),
          ...(bold ? { bold: true } : {}),
        });
      }

      // Skip fully blank rows (e.g. spacer rows some sheets have).
      if (cells.some((c) => c.text.trim() !== "")) {
        rows.push({ cells });
      }
    });

    tables.push({
      sheetName: worksheet.name,
      sourceFile: fileName,
      rows,
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