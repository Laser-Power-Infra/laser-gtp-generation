/**
 * Types for the GTP (Guaranteed Technical Particulars) document.
 * One GTPTable = one Excel sheet = one page in the final PDF.
 */

/** A single table cell, with merge info carried over from the source Excel sheet. */
export interface GTPCell {
  text: string;
  /** Horizontal merge width, e.g. a title row spanning all columns. Omit/1 = no merge. */
  colspan?: number;
  /** Vertical merge height, e.g. "Works 1 / Works 2" spanning 2 rows. Omit/1 = no merge. */
  rowspan?: number;
  /** True for header/title rows and bold source cells. */
  bold?: boolean;
}

export interface GTPRow {
  cells: GTPCell[];
}

/** One full table — corresponds 1:1 to one Excel sheet, and one PDF page. */
export interface GTPTable {
  /** Sheet name, used as a fallback heading / for debugging. */
  sheetName: string;
  /** Which source workbook this came from — useful for troubleshooting bad data. */
  sourceFile: string;
  /** All rows, header rows included, in top-to-bottom order exactly as in Excel. */
  rows: GTPRow[];
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