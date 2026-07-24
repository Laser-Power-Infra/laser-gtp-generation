const SMARTSHEET_API = "https://api.smartsheet.com/2.0";

const token = process.env.SMARTSHEET_API_TOKEN;
const sheetId = process.env.SMARTSHEET_SHEET_ID;

if (!token || !sheetId) {
  console.error("Error: SMARTSHEET_API_TOKEN and SMARTSHEET_SHEET_ID must be set in .env");
  process.exit(1);
}

const url = `${SMARTSHEET_API}/sheets/${sheetId}`;

try {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${res.statusText}`);
    const body = await res.text();
    console.error(body);
    process.exit(1);
  }

  const sheet = await res.json();

  console.log(`\nSheet: "${sheet.name}" (${sheet.id})`);
  console.log(`Rows: ${sheet.rows.length}`);
  console.log(`Columns: ${sheet.columns.length}\n`);

  for (const col of sheet.columns) {
    console.log(`  [${col.index}] "${col.title}"  (id: ${col.id}, type: ${col.type})`);
  }

  console.log();
} catch (err) {
  console.error("Failed:", err.message);
  process.exit(1);
}
