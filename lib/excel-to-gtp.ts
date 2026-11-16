import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import fs from "fs";
import {
  GTPTable, GTPRow, GTPCell, GTPAlignment, GTPVerticalAlign, GTPCellBorders,
} from "@/types/gtp-types";

const XLS_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

const THIN_BORDERS: GTPCellBorders = {
  top: { style: "thin", color: "000000" },
  left: { style: "thin", color: "000000" },
  bottom: { style: "thin", color: "000000" },
  right: { style: "thin", color: "000000" },
};

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
  const fileBuffer = fs.readFileSync(filePath);
  // Legacy .xls (OLE container, detected by magic bytes rather than the file
  // name): exceljs reads .xlsx only, so convert through SheetJS first.
  // shortcut: SheetJS community edition carries values, merges, number formats
  // and column widths but not fonts/fills/borders, so every .xls cell gets a
  // thin border and bold is lost. Upgrade if .xls styling ever matters.
  const isLegacyXls = fileBuffer.subarray(0, 4).equals(XLS_MAGIC);
  if (isLegacyXls) {
    const legacy = XLSX.read(fileBuffer, { type: "buffer", cellNF: true, cellStyles: true });
    await workbook.xlsx.load(XLSX.write(legacy, { type: "buffer", bookType: "xlsx" }));
  } else {
    await workbook.xlsx.load(fileBuffer as unknown as ArrayBuffer);
  }

  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const tables: GTPTable[] = [];

  workbook.eachSheet((worksheet) => {
    // The document mirrors what Excel shows: hidden sheets, rows and columns are left out.
    if (worksheet.state !== "visible") return;

    const colCount = worksheet.columnCount || 0;
    const hiddenCols = new Set<number>();
    for (let c = 1; c <= colCount; c++) {
      if (worksheet.getColumn(c).hidden) hiddenCols.add(c);
    }

    // Merge ranges, counted over visible cells only: "row,col" of the first
    // visible cell -> its spans plus the real top-left cell that holds the value.
    // Every other visible cell of the range is covered and skipped.
    const mergeInfo = new Map<string, { rowspan: number; colspan: number; srcRow: number; srcCol: number }>();
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

      const visRows: number[] = [];
      for (let r = startRow; r <= endRow; r++) if (!worksheet.getRow(r).hidden) visRows.push(r);
      const visCols: number[] = [];
      for (let c = startCol; c <= endCol; c++) if (!hiddenCols.has(c)) visCols.push(c);
      if (visRows.length === 0 || visCols.length === 0) continue;

      const masterKey = `${visRows[0]},${visCols[0]}`;
      mergeInfo.set(masterKey, {
        rowspan: visRows.length,
        colspan: visCols.length,
        srcRow: startRow,
        srcCol: startCol,
      });
      for (const r of visRows) {
        for (const c of visCols) {
          const key = `${r},${c}`;
          if (key !== masterKey) coveredCells.add(key);
        }
      }
    }

    const rows: GTPRow[] = [];

    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (row.hidden) return;
      const cells: GTPCell[] = [];

      for (let colNumber = 1; colNumber <= colCount; colNumber++) {
        if (hiddenCols.has(colNumber)) continue;
        const key = `${rowNumber},${colNumber}`;
        if (coveredCells.has(key)) continue; // skip cells swallowed by a merge

        const merge = mergeInfo.get(key);
        const cell = merge ? worksheet.getCell(merge.srcRow, merge.srcCol) : row.getCell(colNumber);
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
          ...(isLegacyXls
            ? { borders: THIN_BORDERS }
            : Object.keys(fmt.borders).length > 0 ? { borders: fmt.borders } : {}),
        });
      }

      // Preserve every row exactly as in the sheet, including blank spacer rows.
      rows.push({ cells, ...(row.height && row.height > 0 ? { height: row.height } : {}) });
    });

    // Drop blank rows after the last data row (bordered leftovers print as an empty row).
    // A row partly covered by a merge from above has fewer columns and is kept.
    // shortcut: sheets with hidden columns never match colCount, so their trailing blanks stay; count visible columns if that shows up.
    const isBlankFullRow = (r: GTPRow) =>
      r.cells.every((c) => c.text.trim() === "" && !c.rowspan) &&
      r.cells.reduce((n, c) => n + (c.colspan || 1), 0) === colCount;
    while (rows.length > 0 && isBlankFullRow(rows[rows.length - 1])) rows.pop();

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

    tables.push(mergeSingleValueRows({
      sheetName: worksheet.name,
      sourceFile: fileName,
      rows,
      columnWidths: readColumnWidths(worksheet, colCount),
    }));
  });

  return tables;
}

export function getTableColumnCount(gtpTable: GTPTable): number {
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

export function mergeSingleValueRows(gtpTable: GTPTable): GTPTable {
  const colCount = getTableColumnCount(gtpTable);
  if (colCount <= 1) return gtpTable;

  const newRows: GTPRow[] = gtpTable.rows.map((row) => {
    // Cells that start a vertical merge (e.g. the "5. GENERAL CONSTRUCTIONS"
    // section label beside "A. CONDUCTOR") stay as they are and are never
    // merged into; the single value next to them can still take the empty
    // cells to its right.
    const startsMerge = (cell: GTPCell) => !!cell.rowspan && cell.rowspan > 1;
    const hasRowspan = row.cells.some(startsMerge);

    // Find indices of non-empty cells
    const nonEmptyIndices: number[] = [];
    for (let i = 0; i < row.cells.length; i++) {
      if (row.cells[i].text && row.cells[i].text.trim() !== "" && !startsMerge(row.cells[i])) {
        nonEmptyIndices.push(i);
      }
    }

    if (nonEmptyIndices.length === 1) {
      const targetIdx = nonEmptyIndices[0];
      const targetCell = row.cells[targetIdx];

      // Check if all cells after targetIdx are empty
      const trailingEmpty = row.cells.slice(targetIdx + 1).every(
        (cell) => (!cell.text || cell.text.trim() === "") && !startsMerge(cell)
      );

      if (!trailingEmpty) return row;

      // Check if all cells before targetIdx are empty
      const leadingEmpty = row.cells.slice(0, targetIdx).every(
        (cell) => !cell.text || cell.text.trim() === ""
      );

      const totalRowSpanSum = row.cells.reduce((sum, c) => sum + (c.colspan || 1), 0);

      // If leading cells are empty AND total span equals colCount (no active left vertical merge),
      // merge ALL cells in the row into 1 full-width cell.
      if (!hasRowspan && leadingEmpty && totalRowSpanSum === colCount) {
        if ((targetCell.colspan || 1) >= colCount) return row;

        const mergedCell: GTPCell = {
          ...targetCell,
          colspan: colCount,
        };
        return {
          ...row,
          cells: [mergedCell],
        };
      }

      // Otherwise (e.g. left column is occupied by an active vertical merge like '5. GENERAL CONSTRUCTION'),
      // merge targetCell with all trailing empty cells in this row.
      const trailingSpanSum = row.cells
        .slice(targetIdx)
        .reduce((sum, c) => sum + (c.colspan || 1), 0);

      if (trailingSpanSum > (targetCell.colspan || 1)) {
        const mergedCell: GTPCell = {
          ...targetCell,
          colspan: trailingSpanSum,
        };
        return {
          ...row,
          cells: [...row.cells.slice(0, targetIdx), mergedCell],
        };
      }
    }

    return row;
  });

  return {
    ...gtpTable,
    rows: newRows,
  };
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
    if (worksheet.getColumn(c).hidden) continue;
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
  return s.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, "");
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
  // A formula with no cached result (file never recalculated) renders blank.
  let resolved: unknown = value;
  if (typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
    resolved = (value as { result?: unknown }).result ?? "";
  }

  // Error values (#N/A, #DIV/0!, …) show as their code, like in Excel.
  if (typeof resolved === "object" && resolved !== null && "error" in resolved) {
    return String((resolved as { error: unknown }).error);
  }

  const numFmt = cell.numFmt && cell.numFmt !== "General" ? cell.numFmt : undefined;

  if (typeof resolved === "number") {
    return numFmt ? formatNumber(resolved, numFmt) : formatGeneral(resolved);
  }
  if (resolved instanceof Date) {
    // exceljs drops the backslashes of escaped unit letters (0\ \m\m reads as
    // "0 mm") and then mistakes the number for a date. A digit placeholder with
    // no day/year/time code is a number, so turn it back into one.
    const codes = numFmt?.replace(/\[[^\]]*\]|"[^"]*"/g, "") ?? "";
    if (/[0#]/.test(codes) && !/[ydhs]/i.test(codes)) {
      const serial = resolved.getTime() / 86400000 + 25569;
      return formatNumber(Math.round(serial * 1e9) / 1e9, numFmt!);
    }
    return formatDate(resolved, numFmt ?? "dd-mm-yyyy");
  }
  if (typeof resolved === "boolean") return resolved ? "TRUE" : "FALSE";
  if (typeof resolved === "string") return resolved.trim();
  if (typeof resolved === "object" && resolved !== null) {
    if ("richText" in resolved && Array.isArray((resolved as any).richText)) {
      return (resolved as any).richText.map((rt: any) => rt.text).join("");
    }
    if ("text" in resolved) return String((resolved as any).text);
  }
  return String(resolved).trim();
}

/** "General" display: drops binary float noise (0.30000000000000004 -> 0.3). */
function formatGeneral(value: number): string {
  return String(Number(value.toPrecision(15)));
}

/** Formats a numeric cell value for common Excel number formats. */
function formatNumber(value: number, numFmt: string): string {
  // Sections are positive;negative;zero. The negative section formats the
  // absolute value and supplies its own sign/parentheses.
  const sections = numFmt.split(";");
  let section = sections[0];
  let n = value;
  if (value < 0 && sections.length > 1) {
    section = sections[1];
    n = -value;
  } else if (value === 0 && sections.length > 2) {
    section = sections[2];
  }

  const literals: string[] = [];
  const pattern = section
    .replace(/\[[^\]]*\]/g, "") // [Red], [$-409], …
    .replace(/"([^"]*)"|\\(.)/g, (_m: string, quoted?: string, escaped?: string) => {
      literals.push(quoted ?? escaped ?? "");
      return "\u0001";
    })
    .replace(/_./g, "") // "_)" = blank space as wide as ")"
    .replace(/\*./g, ""); // "*x" = repeat-fill character

  // Text, fraction and General formats: fall back to the plain number.
  if (/[@?]|general/i.test(pattern)) return formatGeneral(value);

  const match = pattern.match(/^([^#0]*)([#0][#,0]*\.?[#0]*)(.*)$/);
  if (!match) return formatGeneral(value);

  const prefix = match[1];
  const numPart = match[2];
  let suffix = match[3];
  const dotIdx = numPart.indexOf(".");
  const decimalDigits = dotIdx >= 0 ? numPart.slice(dotIdx + 1) : "";
  const maxDecimals = decimalDigits.length;
  const minDecimals = decimalDigits.replace(/#/g, "").length;

  let s: string;
  const scientific = suffix.match(/^E([+-])(0+)/i);
  if (scientific) {
    const [mantissa, exp] = n.toExponential(maxDecimals).split("e");
    const e = Number(exp);
    const sign = e < 0 ? "-" : scientific[1] === "+" ? "+" : "";
    s = `${mantissa}E${sign}${String(Math.abs(e)).padStart(scientific[2].length, "0")}`;
    suffix = suffix.slice(scientific[0].length);
  } else {
    if (suffix.includes("%")) n *= 100;
    let [int, dec = ""] = n.toFixed(maxDecimals).split(".");
    while (dec.length > minDecimals && dec.endsWith("0")) dec = dec.slice(0, -1);
    if (numPart.includes(",")) {
      const neg = int.startsWith("-");
      int = (neg ? "-" : "") + (neg ? int.slice(1) : int).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    s = dec ? `${int}.${dec}` : int;
  }

  let i = 0;
  return (prefix + s + suffix).replace(/\u0001/g, () => literals[i++] ?? "");
}

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const DATE_TOKEN =
  /"([^"]*)"|\\(.)|yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|A\/P/gi;

/**
 * Formats a date cell value for common Excel date/time formats.
 * exceljs returns dates as UTC, so UTC getters give the value Excel shows
 * regardless of the server's timezone.
 */
function formatDate(value: Date, numFmt: string): string {
  // Excel's built-in "short date" follows the PC's regional settings; exceljs
  // reports it as US-style mm-dd-yy. Our sheets are authored as day-month-year.
  const fmt = numFmt === "mm-dd-yy" ? "dd-mm-yyyy" : numFmt;
  const section = fmt.split(";")[0].replace(/\[[^\]]*\]/g, "");

  const pad = (n: number) => String(n).padStart(2, "0");
  const twelveHour = /AM\/PM|A\/P/i.test(section);
  const hours24 = value.getUTCHours();
  const hours = twelveHour ? hours24 % 12 || 12 : hours24;

  const matches = [...section.matchAll(DATE_TOKEN)];
  const isLiteral = (m: RegExpMatchArray) => m[1] !== undefined || m[2] !== undefined;
  const codes = matches.filter((m) => !isLiteral(m));

  let out = "";
  let last = 0;
  for (const m of matches) {
    out += section.slice(last, m.index);
    last = (m.index ?? 0) + m[0].length;

    if (isLiteral(m)) {
      out += m[1] ?? m[2];
      continue;
    }

    const token = m[0].toLowerCase();
    // "m"/"mm" mean minutes right after hours or right before seconds, else month.
    const idx = codes.indexOf(m);
    const isMinute =
      (token === "m" || token === "mm") &&
      (/^h/i.test(codes[idx - 1]?.[0] ?? "") || /^s/i.test(codes[idx + 1]?.[0] ?? ""));

    switch (token) {
      case "yyyy": out += value.getUTCFullYear(); break;
      case "yy": out += pad(value.getUTCFullYear() % 100); break;
      case "mmmmm": out += MONTHS_FULL[value.getUTCMonth()][0]; break;
      case "mmmm": out += MONTHS_FULL[value.getUTCMonth()]; break;
      case "mmm": out += MONTHS_FULL[value.getUTCMonth()].slice(0, 3); break;
      case "mm": out += pad(isMinute ? value.getUTCMinutes() : value.getUTCMonth() + 1); break;
      case "m": out += isMinute ? value.getUTCMinutes() : value.getUTCMonth() + 1; break;
      case "dddd": out += DAYS_FULL[value.getUTCDay()]; break;
      case "ddd": out += DAYS_FULL[value.getUTCDay()].slice(0, 3); break;
      case "dd": out += pad(value.getUTCDate()); break;
      case "d": out += value.getUTCDate(); break;
      case "hh": out += pad(hours); break;
      case "h": out += hours; break;
      case "ss": out += pad(value.getUTCSeconds()); break;
      case "s": out += value.getUTCSeconds(); break;
      case "am/pm": out += hours24 < 12 ? "AM" : "PM"; break;
      case "a/p": out += hours24 < 12 ? "A" : "P"; break;
    }
  }
  return out + section.slice(last);
}
