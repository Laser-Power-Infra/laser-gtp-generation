/**
 * Types for the GTP (Guaranteed Technical Particulars) document.
 * One GTPTable = one Excel sheet = one page in the final PDF.
 */

export type GTPAlignment =
  | "left"
  | "center"
  | "right"
  | "justify"
  | "distributed";

/** A single table cell, with merge info and formatting carried over from the source Excel sheet. */
export interface GTPCell {
  text: string;
  /** Horizontal merge width, e.g. a title row spanning all columns. Omit/1 = no merge. */
  colspan?: number;
  /** Vertical merge height, e.g. "Works 1 / Works 2" spanning 2 rows. Omit/1 = no merge. */
  rowspan?: number;
  /** True for header/title rows and bold source cells. */
  bold?: boolean;
  /** Font size in points (e.g. 10). Omit to use the document default. */
  fontSize?: number;
  /** Font family name, e.g. "Calibri". Omit to use the document default. */
  fontName?: string;
  /** Font color as a hex string like "FF0000" (no leading #). */
  color?: string;
  /** Solid cell background fill color as a hex string like "F2F2F2". */
  fill?: string;
  /** Horizontal alignment of the cell text. */
  alignment?: GTPAlignment;
  /** Whether the cell text wraps across lines. */
  wrapText?: boolean;
}

export interface GTPRow {
  cells: GTPCell[];
}

/** One full table — corresponds 1:1 to one Excel sheet, and one page in the docx. */
export interface GTPTable {
  /** Sheet name, used as a fallback heading / for debugging. */
  sheetName: string;
  /** Which source workbook this came from — useful for troubleshooting bad data. */
  sourceFile: string;
  /** All rows, header rows included, in top-to-bottom order exactly as in Excel. */
  rows: GTPRow[];
  /**
   * Column widths in Excel "character width" units, in column order.
   * Used to preserve the source sheet's proportions in the generated docx.
   */
  columnWidths?: number[];
}

/** Static header fields at the top of the document (from the docx, not the Excel files). */
export interface GTPDocumentHeader {
  owner: string;
  project: string;
  contractor: string;
  loiNo: string;
}

/** Full data shape passed into the Handlebars template. */
export interface GTPDocumentData extends GTPDocumentHeader {
  tables: GTPTable[];
}