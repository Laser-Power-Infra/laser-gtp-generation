import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { generateGtpForRecord } from "@/lib/generate-for-record";

// GTP flow: PDF mailed for internal review -> approved -> the same PDF mailed to the client.

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** "a@x.com; b@y.com" -> "a@x.com, b@y.com"; null when any address is malformed. */
function cleanAddresses(raw: unknown): string | null {
  const list = String(raw ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return list.every((a) => EMAIL.test(a)) ? list.join(", ") : null;
}

function toHtml(message: string): string {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r?\n/g, "<br>");
  return `<div style="font-family:Arial,sans-serif;font-size:14px">${escaped}</div>`;
}

async function sendMail(mail: {
  to: string; cc: string; subject: string; message: string; pdf: Uint8Array; fileName: string;
}): Promise<string | null> {
  const url = process.env.N8N_GTP_MAIL_WEBHOOK_URL;
  const key = process.env.N8N_GTP_MAIL_KEY;
  if (!url || !key) {
    throw new Error("Mail is not set up: N8N_GTP_MAIL_WEBHOOK_URL / N8N_GTP_MAIL_KEY missing in .env");
  }

  const form = new FormData();
  form.append("to", mail.to);
  form.append("cc", mail.cc);
  form.append("subject", mail.subject);
  form.append("html", toHtml(mail.message));
  form.append("attachment", new Blob([new Uint8Array(mail.pdf)], { type: "application/pdf" }), mail.fileName);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "x-gtp-key": key },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new Error("The mail service did not answer. Check Sent mail before trying again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Mail service answered ${res.status}`);
  }
  return data.messageId ?? null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { recordId, action, orientation } = body as {
    recordId?: string;
    action?: "review" | "approve" | "client";
    orientation?: "portrait" | "landscape";
  };

  if (!recordId || (action !== "review" && action !== "approve" && action !== "client")) {
    return NextResponse.json({ error: "Missing recordId or unknown action" }, { status: 400 });
  }

  const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

  try {
    // Read first: without the GtpMail table this fails before any mail goes out.
    const latest = await prisma.gtpMail
      .findFirst({
        where: { recordId },
        orderBy: { createdAt: "desc" },
        select: { stage: true, version: true },
      })
      .catch(() => {
        throw new Error(
          "Could not read the review history. If the GtpMail table is not created yet, run: npx prisma migrate deploy"
        );
      });

    const { userId } = await auth();
    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
      : null;
    const byUser = user?.email ?? userId ?? null;

    const done = async (data: {
      stage: string; version: number; sentTo?: string; cc?: string;
      messageId?: string | null; fileName?: string; pdf?: Uint8Array<ArrayBuffer>;
    }) => {
      try {
        const row = await prisma.gtpMail.create({
          data: { recordId, byUser, ...data },
          select: { stage: true, version: true, sentTo: true, createdAt: true },
        });
        return NextResponse.json({ review: row });
      } catch (error) {
        console.error("[Review] Could not save step:", error);
        // Say so plainly: a retry would mail the same people twice.
        return fail(
          data.sentTo
            ? `The mail was sent to ${data.sentTo}, but its status could not be saved. Do not send it again.`
            : "The status could not be saved",
          500
        );
      }
    };

    if (action === "approve") {
      if (latest?.stage !== "review") return fail("Nothing is waiting for approval on this docket");
      return done({ stage: "approved", version: latest.version });
    }

    const to = cleanAddresses(body.to);
    const cc = cleanAddresses(body.cc);
    const subject = String(body.subject ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!to || cc === null) return fail("Check the To / CC addresses");
    if (!subject || !message) return fail("Subject and message are required");

    if (action === "review") {
      const result = await generateGtpForRecord(
        recordId,
        "pdf",
        orientation === "landscape" ? "landscape" : "portrait"
      );
      if (!result.ok) return fail(result.error, result.status);

      const pdf = new Uint8Array(result.buffer);
      const messageId = await sendMail({ to, cc, subject, message, pdf, fileName: result.filename });
      return done({
        stage: "review", version: result.version, sentTo: to, cc, messageId,
        fileName: result.filename, pdf,
      });
    }

    // action === "client": only the PDF that was reviewed and approved may go out.
    if (latest?.stage !== "approved" && latest?.stage !== "client") {
      return fail("This GTP is not approved yet");
    }
    const reviewed = await prisma.gtpMail.findFirst({
      where: { recordId, stage: "review", version: latest.version },
      orderBy: { createdAt: "desc" },
      select: { pdf: true, fileName: true },
    });
    if (!reviewed?.pdf) return fail("The approved PDF was not found. Send it for review again.", 409);

    const fileName = reviewed.fileName || `GTP_v${latest.version}.pdf`;
    const messageId = await sendMail({ to, cc, subject, message, pdf: reviewed.pdf, fileName });
    return done({ stage: "client", version: latest.version, sentTo: to, cc, messageId });
  } catch (error) {
    console.error("[Review] Failed:", error);
    return fail(error instanceof Error ? error.message : "Review step failed", 500);
  }
}
