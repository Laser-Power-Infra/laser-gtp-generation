import type {
  GTPTable, GTPRow, GTPCell, GTPCellBorders,
} from "@/types/gtp-types";
import { layoutTable, type CellSlot, type RowLayout } from "./gtp-layout";

/**
 * Splits GTP sheets that contain repeated cable-size groups (e.g. a main
 * header row of "GUARANTEED TECHNICAL PARTICULARS | 100 SQ MM | 148 SQ MM | …")
 * into one narrow table per size. Each per-size table keeps ALL the internal
 * header rows and label columns from the source (Sl. No., Description as per
 * Specification, Requirements as per Specification, …) plus that size's value
 * column(s), so no internal header is lost.
 *
 * Sheets that don't match the pattern are returned unchanged.
 */

const SIZE_PATTERN = /^\s*\d+(?:[A-Z]{1,4}\s*\d*)?\s*(?:SQ\.?\s*MM|SQMM|MM\s*2|MM2|MM²)/i;

const HEADER_KEYWORD =
  /^(?:Sl\.?\s*No\.?|Description|Requirement|Bidder|Specification|Particular|Unit|Value|Remarks?|Details?)/i;

function isSizeCell(cell: GTPCell): boolean {
  return SIZE_PATTERN.test(cell.text.trim());
}

function isHeaderKeywordCell(cell: GTPCell): boolean {
  return HEADER_KEYWORD.test(cell.text.trim());
}

interface SizeEntry {
  colIdx: number;
  /** Number of grid columns under this size (e.g. 2 for Required / Offered). */
  span: number;
  label: string;
  /** The size's own header cell in the source sheet. */
  cell: GTPCell;
}

const DEFAULT_BORDER: GTPCellBorders = {
  top: { style: "thin", color: "000000" },
  left: { style: "thin", color: "000000" },
  bottom: { style: "thin", color: "000000" },
  right: { style: "thin", color: "000000" },
};

function ensureBorder(cell: GTPCell): GTPCell {
  if (cell.borders && Object.keys(cell.borders).length > 0) return cell;
  return { ...cell, borders: DEFAULT_BORDER };
}

function makeHeaderCell(text: string, opts?: { colspan?: number; like?: GTPCell }): GTPCell {
  return {
    text,
    bold: true,
    // Same typeface as the sheet, so the generated title row doesn't stand out.
    ...(opts?.like?.fontName ? { fontName: opts.like.fontName } : {}),
    ...(opts?.like?.fontSize ? { fontSize: opts.like.fontSize } : {}),
    ...(opts?.colspan && opts.colspan > 1 ? { colspan: opts.colspan } : {}),
    borders: DEFAULT_BORDER,
  };
}

function findSizeRow(
  table: GTPTable,
  layout: RowLayout[]
): { sizeRowIdx: number; sizes: SizeEntry[]; labelColCount: number } | null {
  const limit = Math.min(table.rows.length, 4);
  for (let r = 0; r < limit; r++) {
    const sizes: SizeEntry[] = [];
    for (const sl of layout[r].slots) {
      if (isSizeCell(sl.cell)) {
        sizes.push({ colIdx: sl.startCol, span: sl.colspan, label: sl.cell.text.trim(), cell: sl.cell });
      }
    }
    if (sizes.length >= 2) {
      const labelColCount = sizes[0].colIdx;
      if (labelColCount < 1) return null;
      return { sizeRowIdx: r, sizes, labelColCount };
    }
  }
  return null;
}

function findMainTitle(layout: RowLayout[], sizeRowIdx: number, labelColCount: number): string {
  for (const sl of layout[sizeRowIdx].slots) {
    if (sl.startCol < labelColCount && sl.cell.text.trim() !== "") return sl.cell.text.trim();
  }
  for (let r = sizeRowIdx - 1; r >= 0; r--) {
    for (const sl of layout[r].slots) {
      const t = sl.cell.text.trim();
      if (t !== "" && (sl.startCol < labelColCount || sl.colspan >= labelColCount)) return t;
    }
  }
  return "GUARANTEED TECHNICAL PARTICULARS";
}

function rowIsInternalHeader(s: CellSlot[], labelColCount: number): boolean {
  let hasLabelContent = false;
  let allLabelBold = true;
  let anyKeyword = false;
  for (const sl of s) {
    if (sl.startCol >= labelColCount) continue;
    hasLabelContent = true;
    if (sl.cell.text.trim() === "") continue;
    if (!sl.cell.bold) allLabelBold = false;
    if (isHeaderKeywordCell(sl.cell)) anyKeyword = true;
  }
  if (!hasLabelContent) return true;
  return allLabelBold || anyKeyword;
}

/**
 * Maps one source row into the per-size table's column layout:
 * label columns (0..labelColCount-1) + that size's value column(s).
 * Full-width divider rows (e.g. "4. GENERAL TECHNICAL REQUIREMENTS:") become
 * a single merged cell spanning the whole per-size table.
 */
function buildRowCells(
  row: GTPRow,
  lay: RowLayout,
  labelColCount: number,
  size: SizeEntry,
  isHeader: boolean,
  sizeRowIdx: number
): GTPRow {
  const divider = lay.slots.find(
    (sl) =>
      sl.startCol === 0 &&
      sl.startCol + sl.colspan > labelColCount &&
      sl.cell.text.trim() !== ""
  );
  if (divider) {
    return {
      cells: [ensureBorder({ ...divider.cell, colspan: labelColCount + size.span, rowspan: undefined })],
      height: row.height,
    };
  }

  const valueEnd = size.colIdx + size.span;
  const placed: { col: number; cell: GTPCell }[] = [];
  const filled = new Set<number>();
  const place = (sl: CellSlot, from: number, to: number, bold: boolean): boolean => {
    const start = Math.max(sl.startCol, from);
    const end = Math.min(sl.startCol + sl.colspan, to);
    if (end <= start) return false;
    placed.push({
      col: start,
      cell: ensureBorder({ ...sl.cell, colspan: end - start, ...(bold ? { bold: true } : {}) }),
    });
    for (let c = start; c < end; c++) filled.add(c);
    return true;
  };

  for (const sl of lay.slots) {
    // A cell is either a label cell or a value cell, never both.
    if (!place(sl, 0, labelColCount, isHeader)) place(sl, size.colIdx, valueEnd, false);
  }

  // Pad columns that have no cell, unless a vertical merge kept in this table covers them.
  const pad = (col: number) => {
    if (filled.has(col)) return;
    const owner = lay.coveredFrom.get(col);
    if (owner !== undefined && owner > sizeRowIdx) return;
    placed.push({ col, cell: isHeader ? makeHeaderCell("") : { text: "", borders: DEFAULT_BORDER } });
  };
  for (let c = 0; c < labelColCount; c++) pad(c);
  for (let c = size.colIdx; c < valueEnd; c++) pad(c);

  placed.sort((a, b) => a.col - b.col);
  return { cells: placed.map((p) => p.cell), height: row.height };
}

function buildSizeTable(
  table: GTPTable,
  size: SizeEntry,
  mainTitle: string,
  labelColCount: number,
  layout: RowLayout[],
  sizeRowIdx: number,
  headerRowCount: number
): GTPTable {
  const rows: GTPRow[] = [];

  rows.push({
    cells: [
      makeHeaderCell(mainTitle, { colspan: labelColCount, like: size.cell }),
      makeHeaderCell(size.label, { colspan: size.span, like: size.cell }),
    ],
  });

  for (let r = sizeRowIdx + 1; r < table.rows.length; r++) {
    const isHeader = r <= sizeRowIdx + headerRowCount;
    rows.push(buildRowCells(table.rows[r], layout[r], labelColCount, size, isHeader, sizeRowIdx));
  }

  const srcWidths = table.columnWidths ?? [];
  const width = (i: number) => {
    const w = srcWidths[i];
    return typeof w === "number" && w > 0 ? w : 12;
  };
  const columnWidths: number[] = [];
  for (let i = 0; i < labelColCount; i++) columnWidths.push(width(i));
  for (let i = 0; i < size.span; i++) columnWidths.push(width(size.colIdx + i));

  return {
    sheetName: `${table.sheetName} — ${size.label}`,
    sourceFile: table.sourceFile,
    rows,
    columnWidths,
  };
}

/**
 * @returns a new list of tables where size-group sheets are split into one
 * table per size; every other sheet is returned unchanged.
 */
export function splitGtpTablesBySize(tables: GTPTable[]): GTPTable[] {
  const out: GTPTable[] = [];

  for (const table of tables) {
    const layout = layoutTable(table);
    const found = findSizeRow(table, layout);
    if (!found) {
      out.push(table);
      continue;
    }

    const { sizeRowIdx, sizes, labelColCount } = found;
    const mainTitle = findMainTitle(layout, sizeRowIdx, labelColCount);

    let headerRowCount = 0;
    for (let r = sizeRowIdx + 1; r < table.rows.length && headerRowCount < 3; r++) {
      if (rowIsInternalHeader(layout[r].slots, labelColCount)) headerRowCount++;
      else break;
    }

    // No data rows below the headers: nothing worth splitting.
    if (sizeRowIdx + 1 + headerRowCount >= table.rows.length) {
      out.push(table);
      continue;
    }

    for (const size of sizes) {
      out.push(buildSizeTable(table, size, mainTitle, labelColCount, layout, sizeRowIdx, headerRowCount));
    }
  }

  return out;
}
