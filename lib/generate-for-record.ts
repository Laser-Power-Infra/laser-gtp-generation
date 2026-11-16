import { prisma } from "@/lib/prisma";
import { parseWorkbooksToGTPTables } from "@/lib/excel-to-gtp";
import { splitGtpTablesBySize } from "@/lib/split-gtp-tables";
import { generateGTPDocx } from "@/lib/generate-gtp-docx";
import { generateGtpPdf } from "@/lib/generate-gtp-pdf";
import fs from "fs";
import path from "path";
import os from "os";

export type GenerateResult =
  | { ok: true; buffer: Buffer; version: number; filename: string }
  | { ok: false; status: number; error: string };

function extractFileId(driveUrl: string): string | null {
  const m = driveUrl.match(/\/d\/([^/]+)/);
  return m ? m[1] : null;
}

/** Builds the GTP document of a docket from its uploaded workbooks and takes the next version number. */
export async function generateGtpForRecord(
  recordId: string,
  outputFormat: "docx" | "pdf",
  pageOrientation: "portrait" | "landscape"
): Promise<GenerateResult> {
  const record = await prisma.docketRecord.findUnique({
    where: { id: recordId },
    // Upload order decides the order of the tables in the document.
    include: { attachments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });

  if (!record) return { ok: false, status: 404, error: "Record not found" };
  if (record.attachments.length === 0) {
    return { ok: false, status: 400, error: "No Excel files uploaded for this record" };
  }

  const titleBlockMode =
    record.titleBlockMode === "custom" || record.titleBlockMode === "none"
      ? record.titleBlockMode
      : "standard";
  const titleBlockCustomRows: { label: string; value: string }[] = Array.isArray(
    record.titleBlockCustomRows
  )
    ? (record.titleBlockCustomRows as unknown as { label: string; value: string }[])
    : [];

  const version = (record.generationVersion ?? 0) + 1;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-"));
  try {
    const filePaths: string[] = [];
    const failed: string[] = [];

    for (const [i, attachment] of record.attachments.entries()) {
      const fileId = extractFileId(attachment.url);
      const res = fileId
        ? await fetch(`https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`)
        : null;

      // Drive answers 200 with an HTML page (virus-scan warning, sign-in) when
      // it will not serve the file itself.
      if (!res || !res.ok || res.headers.get("content-type")?.includes("text/html")) {
        console.warn("[Generate] Failed to download", attachment.name, res?.status);
        failed.push(attachment.name);
        continue;
      }

      // Index prefix: two uploads may share a name. basename: the name comes
      // from the uploader and must not escape tmpDir.
      const filePath = path.join(tmpDir, `${i}_${path.basename(attachment.name)}`);
      fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
      filePaths.push(filePath);
    }

    // A document silently missing one file's tables is worse than no document.
    if (failed.length > 0) {
      return { ok: false, status: 502, error: `Could not download from Drive: ${failed.join(", ")}` };
    }

    const tables = splitGtpTablesBySize(await parseWorkbooksToGTPTables(filePaths));

    const data = {
      owner: record.utility || "",
      project: record.Project || "",
      contractor: record.partyName || "",
      loiNo: record.loiNo || "",
      tables,
    };
    const options = {
      outputPath: path.join(tmpDir, `output.${outputFormat}`),
      orientation: pageOrientation,
      titleBlockMode,
      titleBlockCustomRows,
    } as const;

    const buffer =
      outputFormat === "pdf"
        ? await generateGtpPdf(data, options)
        : await generateGTPDocx(data, options);

    // Only a successful generation consumes a version number.
    await prisma.docketRecord.update({
      where: { id: recordId },
      data: { generationVersion: version },
    });

    return {
      ok: true,
      buffer,
      version,
      filename: `${record.docketNumber || "GTP"}_v${version}.${outputFormat}`,
    };
  } catch (error) {
    console.error("[Generate] Failed:", error);
    return {
      ok: false,
      status: 500,
      error: `Generation failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
