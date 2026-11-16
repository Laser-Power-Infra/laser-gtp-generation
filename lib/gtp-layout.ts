import type { GTPTable, GTPCell } from "@/types/gtp-types";

export interface CellSlot {
  cell: GTPCell;
  /** True grid column of the cell, accounting for rowspans from rows above. */
  startCol: number;
  colspan: number;
}

export interface RowLayout {
  slots: CellSlot[];
  /** Columns occupied by a rowspan from above -> index of the row that owns the merge. */
  coveredFrom: Map<number, number>;
}

/**
 * Places every cell on the table's real column grid. A row's `cells` omit the
 * cells swallowed by a vertical merge from above, so a cell's column is NOT
 * simply the sum of the colspans before it.
 */
export function layoutTable(table: GTPTable): RowLayout[] {
  const remaining: number[] = []; // rows (incl. current) still covered, per column
  const origin: number[] = [];

  return table.rows.map((row, r) => {
    const coveredFrom = new Map<number, number>();
    const slots: CellSlot[] = [];
    let col = 0;
    const skipCovered = () => {
      while ((remaining[col] ?? 0) > 0) {
        coveredFrom.set(col, origin[col]);
        col++;
      }
    };

    for (const cell of row.cells) {
      skipCovered();
      const span = cell.colspan || 1;
      slots.push({ cell, startCol: col, colspan: span });
      if (cell.rowspan && cell.rowspan > 1) {
        for (let i = 0; i < span; i++) {
          remaining[col + i] = cell.rowspan;
          origin[col + i] = r;
        }
      }
      col += span;
    }
    skipCovered();

    for (let c = 0; c < remaining.length; c++) {
      if (remaining[c] > 0) remaining[c]--;
    }
    return { slots, coveredFrom };
  });
}

/**
 * Cuts vertical merges that cross from the repeated header rows into the body.
 * The header part keeps the text; the body part becomes an empty merged cell
 * starting at the first body row. Merges fully inside the header are untouched.
 */
export function cutRowspansAtHeader(table: GTPTable, headerRowCount: number): GTPTable {
  if (headerRowCount <= 0 || headerRowCount >= table.rows.length) return table;

  const layout = layoutTable(table);
  const inserts: { col: number; cell: GTPCell }[] = [];

  const rows = table.rows.map((row, r) => {
    if (r >= headerRowCount) return row;
    return {
      ...row,
      cells: row.cells.map((cell, i) => {
        const rowspan = cell.rowspan ?? 1;
        if (r + rowspan <= headerRowCount) return cell;
        inserts.push({
          col: layout[r].slots[i].startCol,
          cell: { ...cell, text: "", rowspan: r + rowspan - headerRowCount },
        });
        return { ...cell, rowspan: headerRowCount - r };
      }),
    };
  });

  if (inserts.length === 0) return table;

  const firstBody = [
    ...layout[headerRowCount].slots.map((s) => ({ col: s.startCol, cell: s.cell })),
    ...inserts,
  ].sort((a, b) => a.col - b.col);
  rows[headerRowCount] = { ...rows[headerRowCount], cells: firstBody.map((x) => x.cell) };

  return { ...table, rows };
}
