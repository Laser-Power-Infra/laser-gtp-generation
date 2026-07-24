import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseWorkbooksToGTPTables } from "@/lib/excel-to-gtp";
import { generateGTPDocx } from "@/lib/generate-gtp-docx";
import fs from "fs";
import path from "path";
import os from "os";

function extractFileId(driveUrl: string): string | null {
  const m = driveUrl.match(/\/d\/([^/]+)/);
  return m ? m[1] : null;
}

export async function POST(request: Request) {
  const { recordId } = await request.json();

  if (!recordId) {
    return NextResponse.json({ error: "Missing recordId" }, { status: 400 });
  }

  const record = await prisma.docketRecord.findUnique({
    where: { id: recordId },
    include: { attachments: true },
  });

  if (!record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  if (record.attachments.length === 0) {
    return NextResponse.json(
      { error: "No Excel files uploaded for this record" },
      { status: 400 }
    );
  }

  const version = (record.generationVersion ?? 0) + 1;

  await prisma.docketRecord.update({
    where: { id: recordId },
    data: { generationVersion: version },
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-"));
  try {
    const filePaths: string[] = [];

    for (const attachment of record.attachments) {
      const fileId = extractFileId(attachment.url);
      if (!fileId) {
        console.warn("[Generate] Could not extract fileId from:", attachment.url);
        continue;
      }

      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        console.warn("[Generate] Failed to download", attachment.name, res.status);
        continue;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const filePath = path.join(tmpDir, attachment.name);
      fs.writeFileSync(filePath, buffer);
      filePaths.push(filePath);
    }

    if (filePaths.length === 0) {
      return NextResponse.json(
        { error: "Failed to download any Excel files" },
        { status: 500 }
      );
    }

    const tables = await parseWorkbooksToGTPTables(filePaths);

    const data = {
      owner: record.utility || "",
      project: record.Project || "",
      contractor: record.partyName || "",
      loiNo: record.loiNo || "",
      tables,
    };

    const outputPath = path.join(tmpDir, "output.docx");
    const docxBuffer = await generateGTPDocx(data, { outputPath });

    const filename = `${record.docketNumber || "GTP"}_v${version}.docx`;

    return new NextResponse(new Blob([new Uint8Array(docxBuffer)]), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Generation-Version": String(version),
      },
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
