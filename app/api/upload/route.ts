import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadFileToDrive } from "@/lib/gdrive";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const recordId = formData.get("recordId") as string | null;
    const files = formData.getAll("files") as File[];

    if (!recordId) return NextResponse.json({ error: "Missing recordId" }, { status: 400 });
    if (files.length === 0) return NextResponse.json({ error: "No files" }, { status: 400 });

    // Anything else would only fail later, at generation.
    const unsupported = files.filter((f) => !/\.xlsx?$/i.test(f.name));
    if (unsupported.length > 0) {
      return NextResponse.json(
        { error: `Only .xlsx and .xls files are supported: ${unsupported.map((f) => f.name).join(", ")}` },
        { status: 400 }
      );
    }

    console.log("[Upload] Starting upload for record:", recordId, "files:", files.length);

    const results: { name: string; url: string; type: string | null; size: number }[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");
      const res = await uploadFileToDrive(file.name, file.type, base64);
      results.push({ name: file.name, url: res.url, type: file.type, size: file.size });
      console.log("[Upload] Uploaded:", file.name, res.url);
    }

    // Return the saved rows: the client needs each attachment's id to delete it.
    const attachments = await prisma.attachment.createManyAndReturn({
      data: results.map((r) => ({
        recordId,
        name: r.name,
        url: r.url,
        type: r.type,
        size: r.size,
      })),
      select: { id: true, name: true, url: true },
    });

    console.log("[Upload] Saved", attachments.length, "attachments to DB");

    return NextResponse.json({ attachments });
  } catch (error) {
    console.error("[Upload] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { attachmentId } = await request.json();
    if (!attachmentId) {
      return NextResponse.json({ error: "Missing attachmentId" }, { status: 400 });
    }

    console.log("[Upload] Deleting attachment:", attachmentId);

    await prisma.attachment.delete({ where: { id: attachmentId } });

    console.log("[Upload] Deleted attachment:", attachmentId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Upload] Delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}
