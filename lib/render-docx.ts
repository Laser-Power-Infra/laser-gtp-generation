import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, PageBreak, Header, Footer, ImageRun,
  TableLayoutType, convertInchesToTwip, SimpleField, VerticalAlign,
} from "docx";
import type { GTPDocumentData, GTPTable, GTPRow, GTPCell } from "@/types/gtp-types";
import fs from "fs";
import path from "path";

const BORDER = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: "000000",
};

const CELL_MARGINS = { top: 40, bottom: 40, left: 80, right: 80 };

const FONT_SIZE = 18;

interface RowspanEntry {
  startCol: number;
  colSpan: number;
  remaining: number;
}

function buildParagraph(
  text: string,
  options?: { bold?: boolean; alignment?: "left" | "center" | "right"; fontSize?: number }
): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: options?.bold,
        size: options?.fontSize ?? FONT_SIZE,
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

function calculateColumnWidthsInTwips(gtpTable: GTPTable): number[] {
  const colCount = getTableColumnCount(gtpTable);
  if (colCount === 0) return [];

  // 1. Measure max text length for each column (skipping cells with colspans > 1)
  const maxChars = new Array(colCount).fill(0);
  for (const row of gtpTable.rows) {
    let colIdx = 0;
    for (const cell of row.cells) {
      const colSpan = cell.colspan || 1;
      const textLen = cell.text ? cell.text.length : 0;
      if (colSpan === 1) {
        if (colIdx < colCount) {
          maxChars[colIdx] = Math.max(maxChars[colIdx], textLen);
        }
      }
      colIdx += colSpan;
    }
  }

  // 2. Map characters to weights with reasonable bounds.
  const weights = maxChars.map((chars, idx) => {
    // For Sl. No. column (idx === 0), it usually doesn't need much width but must fit "Sl. No."
    if (idx === 0) {
      return Math.max(14, Math.min(20, chars)); // Keep serial numbers between 14 and 20 weight
    }
    // Normal columns: keep weight between 10 and 80.
    return Math.max(10, Math.min(60, chars));
  });

  // Calculate total weight
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  // Total printable width in twips (7.7 inches * 1440 twips/inch = 11088)
  const totalWidthTwip = 11088;

  // Map weights to twips
  const widths = weights.map((w) => Math.round((w / totalWeight) * totalWidthTwip));

  return widths;
}

function buildCell(
  gtpCell: GTPCell,
  options?: { verticalMerge?: "restart" | "continue"; columnSpan?: number; widthTwip?: number }
): TableCell {
  return new TableCell({
    children: [
      buildParagraph(gtpCell.text, {
        bold: gtpCell.bold,
        fontSize: FONT_SIZE,
        alignment: (options?.columnSpan ?? gtpCell.colspan ?? 1) > 1 ? "center" : undefined,
      }),
    ],
    columnSpan: options?.columnSpan ?? gtpCell.colspan,
    verticalMerge: options?.verticalMerge,
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
  const active: RowspanEntry[] = [];
  const rows: TableRow[] = [];

  for (let rowIndex = 0; rowIndex < gtpTable.rows.length; rowIndex++) {
    const gtpRow = gtpTable.rows[rowIndex];
    const cells: TableCell[] = [];
    let colIdx = 0;
    let cellIdx = 0;

    while (colIdx < columnCount) {
      const entry = active.find(
        (e) => colIdx >= e.startCol && colIdx < e.startCol + e.colSpan
      );

      if (entry) {
        // Calculate width for continuation cell
        let cellWidthTwip = 0;
        for (let i = 0; i < entry.colSpan; i++) {
          if (colIdx + i < colWidths.length) {
            cellWidthTwip += colWidths[colIdx + i];
          }
        }
        cells.push(buildContinuationCell(entry.colSpan, cellWidthTwip));
        colIdx += entry.colSpan;
        entry.remaining--;
      } else if (cellIdx < gtpRow.cells.length) {
        const gtpCell = gtpRow.cells[cellIdx];
        const cellSpan = gtpCell.colspan || 1;

        // Calculate cell width in twips
        let cellWidthTwip = 0;
        for (let i = 0; i < cellSpan; i++) {
          if (colIdx + i < colWidths.length) {
            cellWidthTwip += colWidths[colIdx + i];
          }
        }

        if (gtpCell.rowspan && gtpCell.rowspan > 1) {
          active.push({
            startCol: colIdx,
            colSpan: cellSpan,
            remaining: gtpCell.rowspan - 1,
          });
          cells.push(
            buildCell(gtpCell, { 
              verticalMerge: "restart",
              widthTwip: cellWidthTwip 
            })
          );
        } else {
          cells.push(buildCell(gtpCell, { widthTwip: cellWidthTwip }));
        }

        colIdx += cellSpan;
        cellIdx++;
      } else {
        // Calculate width for remaining columns
        const cellWidthTwip = colIdx < colWidths.length ? colWidths[colIdx] : 0;
        cells.push(buildContinuationCell(1, cellWidthTwip));
        colIdx++;
      }
    }

    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].remaining <= 0) {
        active.splice(i, 1);
      }
    }

    const isHeaderRow = rowIndex === 0 || (rowIndex < 3 && gtpRow.cells.every(cell => cell.text.trim() === "" || cell.bold));
    rows.push(new TableRow({
      children: cells,
      cantSplit: true,
      tableHeader: isHeaderRow ? true : undefined,
    }));
  }

  return rows;
}

function buildTable(gtpTable: GTPTable): Table {
  const colWidths = calculateColumnWidthsInTwips(gtpTable);
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

export async function renderDocx(data: GTPDocumentData): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  const logoBuffer = fs.readFileSync(path.join(process.cwd(), "public", "laser-logo.jpeg"));
  const footerDetailsBuffer = fs.readFileSync(path.join(process.cwd(), "public", "footer-company-details.jpeg"));
  const signatureBuffer = fs.readFileSync(path.join(process.cwd(), "public", "puja-mam-signature.jpeg"));

  for (let i = 0; i < data.tables.length; i++) {
    if (i > 0) {
      children.push(buildPageBreak());
    }

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: data.tables[i].sheetName, bold: true, size: 22 }),
        ],
        alignment: "center",
        spacing: { after: 120 },
      })
    );

    children.push(buildTable(data.tables[i]));
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
            // shading: { fill: "1F1F1F" },
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

  const header = new Header({
    children: [
      companyHeaderTable,
      new Paragraph({
        spacing: { before: 120, after: 0 },
      }),
      createHeaderTable(data),
    ],
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
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(0.4),
              bottom: convertInchesToTwip(1.5),
              left: convertInchesToTwip(0.4),
            },
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

  return Packer.toBuffer(doc);
}
