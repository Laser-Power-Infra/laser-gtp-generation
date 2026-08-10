import type {
  GTPTable, GTPRow, GTPCell, GTPCellBorders,
} from "@/types/gtp-types";

/**
 * Splits GTP sheets that contain repeated cable-size groups (e.g. a main
 * header row of "GUARANTEED TECHNICAL PARTICULARS | 100 SQ MM | 148 SQ MM | …")
 * into one narrow table per size. Each per-size table keeps ALL the internal
 * header rows and label columns from the source (Sl. No., Description as per
 * Specification, Requirements as per Specification, …) plus that size's value
 * column, so no internal header is lost.
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
  label: string;
}

interface CellSlot {
  cell: GTPCell;
  startCol: number;
  colspan: number;
}

function slots(row: GTPRow): CellSlot[] {
  const out: CellSlot[] = [];
  let col = 0;
  for (const cell of row.cells) {
    const span = cell.colspan || 1;
    out.push({ cell, startCol: col, colspan: span });
    col += span;
  }
  return out;
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

function makeHeaderCell(text: string, opts?: { colspan?: number }): GTPCell {
  return {
    text,
    bold: true,
    ...(opts?.colspan && opts.colspan > 1 ? { colspan: opts.colspan } : {}),
    borders: DEFAULT_BORDER,
  };
}

function findSizeRow(table: GTPTable): { sizeRowIdx: number; sizes: SizeEntry[]; labelColCount: number } | null {
  const limit = Math.min(table.rows.length, 4);
  for (let r = 0; r < limit; r++) {
    const row = table.rows[r];
    const sizes: SizeEntry[] = [];
    for (const sl of slots(row)) {
      if (isSizeCell(sl.cell)) sizes.push({ colIdx: sl.startCol, label: sl.cell.text.trim() });
    }
    if (sizes.length >= 2) {
      const labelColCount = sizes[0].colIdx;
      if (labelColCount < 1) return null;
      return { sizeRowIdx: r, sizes, labelColCount };
    }
  }
  return null;
}

function findMainTitle(table: GTPTable, sizeRowIdx: number, labelColCount: number): string {
  const sizeRow = table.rows[sizeRowIdx];
  for (const sl of slots(sizeRow)) {
    if (sl.startCol < labelColCount && sl.cell.text.trim() !== "") return sl.cell.text.trim();
  }
  for (let r = sizeRowIdx - 1; r >= 0; r--) {
    for (const sl of slots(table.rows[r])) {
      const t = sl.cell.text.trim();
      if (t !== "" && (sl.startCol < labelColCount || sl.colspan >= labelColCount)) return t;
    }
  }
  return "GUARANTEED TECHNICAL PARTICULARS";
}

function rowIsInternalHeader(row: GTPRow, labelColCount: number): boolean {
  const s = slots(row);
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
 * label columns (0..labelColCount-1) + the single size value column.
 * Full-width divider rows (e.g. "4. GENERAL TECHNICAL REQUIREMENTS:") become
 * a single merged cell spanning the whole per-size table.
 */
function buildRowCells(
  row: GTPRow,
  labelColCount: number,
  sizeColIdx: number,
  isHeader: boolean
): GTPRow {
  const s = slots(row);

  const divider = s.find(
    (sl) =>
      sl.startCol === 0 &&
      sl.startCol + sl.colspan > labelColCount &&
      sl.cell.text.trim() !== ""
  );
  if (divider) {
    return {
      cells: [ensureBorder({ ...divider.cell, colspan: labelColCount + 1, rowspan: undefined })],
      height: row.height,
    };
  }

  const cells: GTPCell[] = [];
  let hasSize = false;
  for (const sl of s) {
    const end = sl.startCol + sl.colspan;
    if (end <= labelColCount) {
      cells.push(isHeader ? ensureBorder({ ...sl.cell, bold: true }) : ensureBorder(sl.cell));
    } else if (sl.startCol < labelColCount) {
      cells.push(
        isHeader
          ? ensureBorder({ ...sl.cell, bold: true, colspan: labelColCount - sl.startCol })
          : ensureBorder({ ...sl.cell, colspan: labelColCount - sl.startCol })
      );
    } else if (sizeColIdx >= sl.startCol && sizeColIdx < end) {
      cells.push(ensureBorder({ ...sl.cell, colspan: 1 }));
      hasSize = true;
    }
  }
  if (!hasSize) {
    cells.push(isHeader ? makeHeaderCell("") : { text: "", borders: DEFAULT_BORDER });
  }

  return { cells, height: row.height };
}

function buildSizeTable(
  table: GTPTable,
  size: SizeEntry,
  mainTitle: string,
  labelColCount: number,
  headerRows: GTPRow[],
  dataRows: GTPRow[]
): GTPTable {
  const rows: GTPRow[] = [];

  rows.push({
    cells: [
      makeHeaderCell(mainTitle, { colspan: labelColCount }),
      makeHeaderCell(size.label),
    ],
  });

  for (const h of headerRows) {
    rows.push(buildRowCells(h, labelColCount, size.colIdx, true));
  }
  for (const d of dataRows) {
    rows.push(buildRowCells(d, labelColCount, size.colIdx, false));
  }

  const srcWidths = table.columnWidths ?? [];
  const labelWidths: number[] = [];
  for (let i = 0; i < labelColCount; i++) {
    const w = srcWidths[i];
    labelWidths.push(typeof w === "number" && w > 0 ? w : 12);
  }
  const sw = srcWidths[size.colIdx];
  const sizeWidth = typeof sw === "number" && sw > 0 ? sw : 12;

  return {
    sheetName: `${table.sheetName} — ${size.label}`,
    sourceFile: table.sourceFile,
    rows,
    columnWidths: [...labelWidths, sizeWidth],
  };
}

/**
 * @returns a new list of tables where size-group sheets are split into one
 * table per size; every other sheet is returned unchanged.
 */
export function splitGtpTablesBySize(tables: GTPTable[]): GTPTable[] {
  const out: GTPTable[] = [];

  for (const table of tables) {
    const found = findSizeRow(table);
    if (!found) {
      out.push(table);
      continue;
    }

    const { sizeRowIdx, sizes, labelColCount } = found;
    const mainTitle = findMainTitle(table, sizeRowIdx, labelColCount);

    const headerRows: GTPRow[] = [];
    for (let r = sizeRowIdx + 1; r < table.rows.length && headerRows.length < 3; r++) {
      if (rowIsInternalHeader(table.rows[r], labelColCount)) headerRows.push(table.rows[r]);
      else break;
    }

    const dataStart = sizeRowIdx + 1 + headerRows.length;
    const dataRows = table.rows.slice(dataStart);

    if (dataRows.length === 0) {
      out.push(table);
      continue;
    }

    for (const size of sizes) {
      out.push(buildSizeTable(table, size, mainTitle, labelColCount, headerRows, dataRows));
    }
  }

  return out;
}
