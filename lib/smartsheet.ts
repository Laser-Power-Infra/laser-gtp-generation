const SMARTSHEET_API = "https://api.smartsheet.com/2.0";

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

interface SmartsheetColumn {
  id: number;
  title: string;
  index: number;
  type: string;
}

interface SmartsheetSheet {
  id: number;
  name: string;
  columns: SmartsheetColumn[];
  rows: SmartsheetRow[];
}

const COLUMN_MAP: Record<string, string> = {
  "Docket No  (Debosmita Nath)": "docketNumber",
  "Utility (Marketing Team)": "utility",
  "Party Name  (Debosmita Nath)": "partyName",
  "Project Name (Marketing Team)": "projectRefNo",
  "Enquiry / Tender No. (Marketing Team)": "enquiryTenderNo",
};

export interface SmartsheetRecord {
  docketNumber: string;
  utility: string;
  partyName: string;
  projectRefNo: string;
  enquiryTenderNo: string;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const body = await res.text();
        console.error("[Smartsheet] API error:", res.status, res.statusText, body);
        throw new Error(`Smartsheet API error: ${res.status} ${res.statusText}`);
      }

      return res;
    } catch (err) {
      clearTimeout(timeoutId);

      const isNetworkError =
        err instanceof TypeError ||
        err instanceof DOMException ||
        (err instanceof Error && err.message?.includes("UND_ERR_CONNECT_TIMEOUT"));

      if (attempt < maxRetries && isNetworkError) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.warn(
          `[Smartsheet] Attempt ${attempt}/${maxRetries} failed (network error), retrying in ${delay}ms...`,
          err instanceof Error ? err.message : err
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      console.error(
        `[Smartsheet] All ${maxRetries} attempts failed. Smartsheet API is unreachable.`,
        err instanceof Error ? err.message : err
      );
      throw new Error(
        `Smartsheet API unreachable after ${maxRetries} attempts: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  throw new Error("Unreachable");
}

export async function fetchAllRecords(): Promise<SmartsheetRecord[]> {
  const token = process.env.SMARTSHEET_API_TOKEN;
  const sheetId = process.env.SMARTSHEET_SHEET_ID;

  console.log("[Smartsheet] Starting fetch. Token present:", !!token, "Sheet ID:", sheetId);

  if (!token || !sheetId) {
    throw new Error("SMARTSHEET_API_TOKEN and SMARTSHEET_SHEET_ID must be set");
  }

  const url = `${SMARTSHEET_API}/sheets/${sheetId}`;
  console.log("[Smartsheet] Fetching URL:", url);
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const sheet: SmartsheetSheet = await res.json();
  console.log("[Smartsheet] Sheet name:", sheet.name, "Rows:", sheet.rows.length, "Columns:", sheet.columns.length);

  sheet.columns.forEach((c) => console.log("[Smartsheet] Column:", c.title, `(id:${c.id}, idx:${c.index})`));

  const columnIdToField = buildColumnMap(sheet.columns);

  const records: SmartsheetRecord[] = [];

  for (const row of sheet.rows) {
    const record = rowToRecord(row, columnIdToField);
    if (record && record.docketNumber) {
      records.push(record);
    } else {
      console.log("[Smartsheet] Skipping row", row.rowNumber, row.id, "- no docketNumber");
    }
  }

  console.log("[Smartsheet] Total records extracted:", records.length);
  if (records.length > 0) {
    console.log("[Smartsheet] Sample record:", JSON.stringify(records[0]));
  }
  return records;
}

function buildColumnMap(columns: SmartsheetColumn[]): Record<number, string> {
  const map: Record<number, string> = {};
  const matched: string[] = [];
  const unmatched: string[] = [];

  for (const col of columns) {
    const field = COLUMN_MAP[col.title];
    if (field) {
      map[col.id] = field;
      matched.push(`${col.title} → ${field}`);
    } else {
      unmatched.push(col.title);
    }
  }

  console.log("[Smartsheet] Matched columns:", matched.length ? matched.join(" | ") : "NONE");
  console.log("[Smartsheet] Unmatched columns:", unmatched.length ? unmatched.join(" | ") : "none");
  return map;
}

function rowToRecord(
  row: SmartsheetRow,
  columnMap: Record<number, string>
): SmartsheetRecord | null {
  const record: Partial<SmartsheetRecord> = {};

  for (const cell of row.cells) {
    const field = columnMap[cell.columnId];
    if (field) {
      (record as Record<string, unknown>)[field] = cell.value ?? cell.displayValue ?? "";
    }
  }

  if (!record.docketNumber) return null;

  return {
    docketNumber: String(record.docketNumber ?? ""),
    utility: String(record.utility ?? ""),
    partyName: String(record.partyName ?? ""),
    projectRefNo: String(record.projectRefNo ?? ""),
    enquiryTenderNo: String(record.enquiryTenderNo ?? ""),
  };
}
