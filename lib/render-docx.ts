import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, PageBreak, Header,
  TableLayoutType, convertInchesToTwip,
} from "docx";
import type { GTPDocumentData, GTPTable, GTPRow, GTPCell } from "@/types/gtp-types";

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

function buildCell(
  gtpCell: GTPCell,
  options?: { verticalMerge?: "restart" | "continue"; columnSpan?: number }
): TableCell {
  return new TableCell({
    children: [
      buildParagraph(gtpCell.text, {
        bold: gtpCell.bold,
        fontSize: FONT_SIZE,
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
    width: { size: 1, type: WidthType.AUTO },
  });
}

function buildContinuationCell(colSpan: number): TableCell {
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
  });
}

function buildRows(gtpTable: GTPTable): TableRow[] {
  const columnCount = getTableColumnCount(gtpTable);
  const active: RowspanEntry[] = [];
  const rows: TableRow[] = [];

  for (const gtpRow of gtpTable.rows) {
    const cells: TableCell[] = [];
    let colIdx = 0;
    let cellIdx = 0;

    while (colIdx < columnCount) {
      const entry = active.find(
        (e) => colIdx >= e.startCol && colIdx < e.startCol + e.colSpan
      );

      if (entry) {
        cells.push(buildContinuationCell(entry.colSpan));
        colIdx += entry.colSpan;
        entry.remaining--;
      } else if (cellIdx < gtpRow.cells.length) {
        const gtpCell = gtpRow.cells[cellIdx];
        const cellSpan = gtpCell.colspan || 1;

        if (gtpCell.rowspan && gtpCell.rowspan > 1) {
          active.push({
            startCol: colIdx,
            colSpan: cellSpan,
            remaining: gtpCell.rowspan - 1,
          });
          cells.push(
            buildCell(gtpCell, { verticalMerge: "restart" })
          );
        } else {
          cells.push(buildCell(gtpCell));
        }

        colIdx += cellSpan;
        cellIdx++;
      } else {
        colIdx++;
      }
    }

    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].remaining <= 0) {
        active.splice(i, 1);
      }
    }

    rows.push(new TableRow({ children: cells }));
  }

  return rows;
}

function buildTable(gtpTable: GTPTable): Table {
  return new Table({
    rows: buildRows(gtpTable),
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
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

  const header = new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: "LASER POWER AND INFRA LIMITED", bold: true, size: 30 }),
        ],
        alignment: "center",
        spacing: { after: 0 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Kolkata, West Bengal India; info@laserpowerinfra.com", size: 18 }),
        ],
        alignment: "center",
        spacing: { after: 200 },
      }),
      createHeaderTable(data),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        headers: { default: header },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
