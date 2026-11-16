import { NextResponse } from "next/server";
import { generateGtpForRecord } from "@/lib/generate-for-record";

const CONTENT_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { recordId, orientation, format } = body as {
    recordId?: string;
    orientation?: "portrait" | "landscape";
    format?: "docx" | "pdf";
  };

  if (!recordId) {
    return NextResponse.json({ error: "Missing recordId" }, { status: 400 });
  }

  const outputFormat = format === "pdf" ? "pdf" : "docx";
  const result = await generateGtpForRecord(
    recordId,
    outputFormat,
    orientation === "landscape" ? "landscape" : "portrait"
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Headers are Latin-1 only; docket numbers can carry en dashes etc.
  const asciiName = result.filename.replace(/[^\x20-\x7E]|["\\]/g, "_");

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": CONTENT_TYPES[outputFormat],
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
      "X-Generation-Version": String(result.version),
    },
  });
}
