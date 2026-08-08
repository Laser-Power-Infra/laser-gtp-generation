import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAllRecords, SmartsheetRecord } from "@/lib/smartsheet";

export async function GET() {
  console.log("[API] GET /api/records called");
  try {
    const records = await prisma.docketRecord.findMany({
      orderBy: { docketNumber: "asc" },
      include: { attachments: { select: { id: true, name: true, url: true } } },
    });
    console.log("[API] GET result:", records.length, "records found");
    return NextResponse.json({ records });
  } catch (error) {
    console.error("[API] GET /api/records error:", error);
    return NextResponse.json(
      { error: "Failed to fetch records" },
      { status: 500 }
    );
  }
}

const ALLOWED_FIELDS = new Set(["loiNo", "project", "projectRefNo", "partyName", "docketNumber", "utility", "enquiryTenderNo", "excelFiles", "docxStatus", "generationVersion", "titleBlockMode", "titleBlockCustomRows"]);

const VIRTUAL_FIELDS = new Set(["excelFiles", "docxStatus"]);

const FIELD_MAP: Record<string, string> = {
  project: "Project",
};

export async function PATCH(request: Request) {
  try {
    const { id, field, value } = await request.json();
    if (!id || !field) {
      return NextResponse.json({ error: "Missing id or field" }, { status: 400 });
    }
    if (!ALLOWED_FIELDS.has(field)) {
      return NextResponse.json({ error: `Field '${field}' is not updatable` }, { status: 400 });
    }
    if (VIRTUAL_FIELDS.has(field)) {
      return NextResponse.json({ success: true });
    }
    const dbField = FIELD_MAP[field] ?? field;
    await prisma.docketRecord.update({
      where: { id },
      data: { [dbField]: value },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] PATCH /api/records error:", error);
    return NextResponse.json(
      { error: "Failed to update record" },
      { status: 500 }
    );
  }
}

export async function POST() {
  console.log("[API] POST /api/records called (sync)");
  try {
    const smartsheetRecords = await fetchAllRecords();
    console.log("[API] Fetched", smartsheetRecords.length, "records from Smartsheet");

    if (smartsheetRecords.length === 0) {
      console.warn("[API] No records returned from Smartsheet");
      const allRecords = await prisma.docketRecord.findMany({ orderBy: { docketNumber: "asc" }, include: { attachments: { select: { id: true, name: true, url: true } } } });
      return NextResponse.json({ records: allRecords, syncedCount: 0 });
    }

    // 1. Fetch all existing records from DB (1 query)
    const existingRecords = await prisma.docketRecord.findMany();
    const existingMap = new Map(existingRecords.map((r) => [r.docketNumber, r]));
    console.log("[API] Existing DB records:", existingRecords.length);

    // 2. Separate into new and updated
    const toCreate: { docketNumber: string; utility: string; partyName: string; projectRefNo: string; enquiryTenderNo: string }[] = [];
    const toUpdate: { id: string; data: { utility: string; partyName: string; projectRefNo: string; enquiryTenderNo: string } }[] = [];

    for (const sr of smartsheetRecords) {
      const existing = existingMap.get(sr.docketNumber);
      if (existing) {
        const changed =
          existing.utility !== sr.utility ||
          existing.partyName !== sr.partyName ||
          existing.projectRefNo !== sr.projectRefNo ||
          existing.enquiryTenderNo !== sr.enquiryTenderNo;
        if (changed) {
          toUpdate.push({ id: existing.id, data: { utility: sr.utility, partyName: sr.partyName, projectRefNo: sr.projectRefNo, enquiryTenderNo: sr.enquiryTenderNo } });
        }
      } else {
        toCreate.push(sr);
      }
    }

    // 3. Bulk insert new records (1 query)
    if (toCreate.length > 0) {
      console.log("[API] Creating", toCreate.length, "new records");
      await prisma.docketRecord.createMany({ data: toCreate, skipDuplicates: true });
    }

    // 4. Bulk update changed records (single transaction = 1 network round trip)
    if (toUpdate.length > 0) {
      console.log("[API] Updating", toUpdate.length, "changed records");
      await prisma.$transaction(
        toUpdate.map((u) =>
          prisma.docketRecord.update({ where: { id: u.id }, data: u.data })
        ),{
          timeout: 100000
        }
      );
    }

    const syncedCount = toCreate.length + toUpdate.length;
    console.log("[API] Synced:", syncedCount, "records (created:", toCreate.length, "updated:", toUpdate.length, ")");

    const allRecords = await prisma.docketRecord.findMany({
      orderBy: { docketNumber: "asc" },
      include: { attachments: { select: { id: true, name: true, url: true } } },
    });
    console.log("[API] Returning", allRecords.length, "records from DB after sync");

    return NextResponse.json({ records: allRecords, syncedCount });
  } catch (error) {
    console.error("[API] POST /api/records error:", error);
    return NextResponse.json(
      { error: "Sync failed" },
      { status: 500 }
    );
  }
}
