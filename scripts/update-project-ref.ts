import { prisma } from "../lib/prisma";

const SMARTSHEET_API = "https://api.smartsheet.com/2.0";

interface SmartsheetColumn {
  id: number;
  title: string;
  index: number;
}

interface SmartsheetCell {
  columnId: number;
  value: unknown;
  displayValue: string | null;
}

interface SmartsheetRow {
  id: number;
  rowNumber: number;
  cells: SmartsheetCell[];
}

async function main() {
  const token = process.env.SMARTSHEET_API_TOKEN;
  const sheetId = process.env.SMARTSHEET_SHEET_ID;

  if (!token || !sheetId) {
    console.error("SMARTSHEET_API_TOKEN and SMARTSHEET_SHEET_ID must be set");
    process.exit(1);
  }

  const url = `${SMARTSHEET_API}/sheets/${sheetId}`;
  console.log("Fetching sheet...");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error(`Smartsheet API error: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const sheet: { columns: SmartsheetColumn[]; rows: SmartsheetRow[] } = await res.json();

  const docketCol = sheet.columns.find((c) => c.title === "Docket No  (Debosmita Nath)");
  const projectCol = sheet.columns.find((c) => c.title === "Project Name (Marketing Team)");

  if (!docketCol || !projectCol) {
    console.error("Could not find required columns in Smartsheet");
    process.exit(1);
  }

  let updated = 0;
  let skipped = 0;

  for (const row of sheet.rows) {
    const docketCell = row.cells.find((c) => c.columnId === docketCol.id);
    const projectCell = row.cells.find((c) => c.columnId === projectCol.id);

    const docketNumber = docketCell?.value ?? docketCell?.displayValue;
    const projectName = String(projectCell?.value ?? projectCell?.displayValue ?? "");

    if (!docketNumber) {
      skipped++;
      continue;
    }

    const result = await prisma.docketRecord.updateMany({
      where: { docketNumber: String(docketNumber) },
      data: { projectRefNo: projectName },
    });

    if (result.count > 0) {
      updated++;
      console.log(`UPDATED: ${String(docketNumber)} → "${projectName}"`);
    } else {
      skipped++;
      console.log(`SKIPPED: ${String(docketNumber)} — no matching DB record`);
    }

    if ((updated + skipped) % 500 === 0) {
      console.log(`Progress: ${updated} updated, ${skipped} skipped (${updated + skipped}/${sheet.rows.length})`);
    }
  }

  console.log(`Done. Updated ${updated} records, skipped ${skipped}.`);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
