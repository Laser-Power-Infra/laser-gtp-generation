import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET || process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("Missing CLERK_WEBHOOK_SIGNING_SECRET or CLERK_WEBHOOK_SECRET environment variable");
    }
    const evt = await verifyWebhook(req, { signingSecret: secret });

    const { id } = evt.data;
    const eventType = evt.type;

    if (!id) {
      return new Response("Missing event data id", { status: 400 });
    }

    switch (eventType) {
      case "user.created":
      case "user.updated": {
        const { email_addresses, first_name, last_name, image_url } = evt.data;
        await prisma.user.upsert({
          where: { id },
          update: {
            email: email_addresses?.[0]?.email_address ?? null,
            firstName: first_name ?? null,
            lastName: last_name ?? null,
            imageUrl: image_url ?? null,
          },
          create: {
            id,
            email: email_addresses?.[0]?.email_address ?? null,
            firstName: first_name ?? null,
            lastName: last_name ?? null,
            imageUrl: image_url ?? null,
          },
        });
        break;
      }
      case "user.deleted": {
        await prisma.user.delete({ where: { id } });
        break;
      }
    }

    return new Response("Webhook received", { status: 200 });
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return new Response("Error verifying webhook", { status: 400 });
  }
}
