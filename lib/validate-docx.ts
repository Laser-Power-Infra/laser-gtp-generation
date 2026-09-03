import JSZip from "jszip";

/**
 * Validates and repairs the generated DOCX package XML:
 * 1. Merges single-text section headers (A. CONDUCTOR, B. INSULATIONS:, etc.) across table grid columns.
 * 2. Removes trailing empty cell span overflows that cause right-side table extension.
 * 3. Ensures merged cells use auto width to snap right borders flush with table grid.
 */
export async function validateAndFixGTPDocx(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  let docXml = await zip.file("word/document.xml")?.async("string");

  if (!docXml) return buffer;

  // Process all tables <w:tbl>...</w:tbl>
  docXml = docXml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/gi, (tblXml) => {
    // Determine grid column count from <w:tblGrid>
    const gridCols = [...tblXml.matchAll(/<w:gridCol\b/gi)].length;
    if (gridCols === 0) return tblXml;

    // Process rows <w:tr>...</w:tr> inside this table
    return tblXml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/gi, (trXml) => {
      // Extract cells <w:tc>...</w:tc>
      const cells = [...trXml.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/gi)].map((m) => m[0]);
      if (cells.length === 0) return trXml;

      // Extract text content of each cell
      const cellTexts = cells.map((cell) => {
        const textMatches = [...cell.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)];
        return textMatches.map((t) => t[1]).join("").trim();
      });

      const nonEmptyIndices: number[] = [];
      cellTexts.forEach((text, idx) => {
        if (text !== "") nonEmptyIndices.push(idx);
      });

      // Check if cell 0 is a vertical merge continuation
      const isCell0VMerge = /<w:vMerge\b[^>]*\bw:val="continue"/i.test(cells[0]);

      // If exactly 1 cell has text (e.g. A. CONDUCTOR, B. INSULATIONS:, C. Sealing end cap:)
      if (nonEmptyIndices.length === 1) {
        const targetIdx = nonEmptyIndices[0];
        const targetTextCell = cells[targetIdx];

        if (isCell0VMerge && targetIdx > 0) {
          // Keep cell 0 as vertical merge continuation
          const cell0Xml = cells[0];
          // Modify targetTextCell to span remaining columns: gridCols - 1
          const remainingCols = gridCols - 1;
          const fixedTargetCell = setCellGridSpan(targetTextCell, remainingCols);
          return replaceRowCells(trXml, [cell0Xml, fixedTargetCell]);
        } else {
          // Single merged cell across entire table width: gridCols
          const fixedCell = setCellGridSpan(targetTextCell, gridCols);
          return replaceRowCells(trXml, [fixedCell]);
        }
      }

      // Check for row gridSpan overflow
      let currentSpanSum = 0;
      const validCells: string[] = [];

      for (let i = 0; i < cells.length; i++) {
        const cXml = cells[i];
        const spanMatch = cXml.match(/<w:gridSpan\b[^>]*\bw:val="(\d+)"/i);
        const span = spanMatch ? parseInt(spanMatch[1], 10) : 1;

        if (currentSpanSum + span <= gridCols) {
          currentSpanSum += span;
          validCells.push(cXml);
        } else {
          // Overflowing cell!
          const allowedSpan = gridCols - currentSpanSum;
          if (allowedSpan > 0) {
            validCells.push(setCellGridSpan(cXml, allowedSpan));
            currentSpanSum += allowedSpan;
          }
          break;
        }
      }

      return replaceRowCells(trXml, validCells);
    });
  });

  zip.file("word/document.xml", docXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

function setCellGridSpan(tcXml: string, span: number): string {
  let updated = tcXml;

  if (span <= 1) {
    updated = updated.replace(/<w:gridSpan\b[^>]*\/>/gi, "");
  } else {
    if (/<w:gridSpan\b/i.test(updated)) {
      updated = updated.replace(
        /<w:gridSpan\b[^>]*\/>/gi,
        `<w:gridSpan w:val="${span}"/>`
      );
    } else if (/<w:tcPr>/i.test(updated)) {
      updated = updated.replace(
        /<w:tcPr>/i,
        `<w:tcPr><w:gridSpan w:val="${span}"/>`
      );
    } else {
      updated = updated.replace(
        /<w:tc>/i,
        `<w:tc><w:tcPr><w:gridSpan w:val="${span}"/></w:tcPr>`
      );
    }

    // Set tcW to auto when merged to prevent fixed width cell right extension
    if (/<w:tcW\b/i.test(updated)) {
      updated = updated.replace(/<w:tcW\b[^>]*\/>/gi, `<w:tcW w:type="auto"/>`);
    }
  }

  return updated;
}

function replaceRowCells(trXml: string, newCells: string[]): string {
  const firstTcIdx = trXml.indexOf("<w:tc");
  const lastTcEnd = trXml.lastIndexOf("</w:tc>") + "</w:tc>".length;

  if (firstTcIdx < 0 || lastTcEnd <= firstTcIdx) return trXml;

  return trXml.slice(0, firstTcIdx) + newCells.join("") + trXml.slice(lastTcEnd);
}
