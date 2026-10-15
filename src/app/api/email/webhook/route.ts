import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { secretMatches } from "@/lib/server/delivery";
import { adminClient } from "@/lib/server/billing";
import { normaliseMessageId } from "@/lib/domain/delivery";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (
    !secretMatches(
      request.headers.get("authorization"),
      process.env.EMAIL_WEBHOOK_SECRET,
    )
  )
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 65536)
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  const raw = await request.text();
  if (raw.length > 65536)
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  let event;
  try {
    event = z
      .object({
        event: z.string().max(50),
        email: z.email(),
        "message-id": z.string().max(500),
        ts_event: z.number().optional(),
        ts: z.number().optional(),
        tags: z.array(z.string()).optional(),
        "X-Mailin-custom": z.string().optional(),
      })
      .parse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  }
  const custom =
      event["X-Mailin-custom"] ??
      event.tags?.find((t) => t.startsWith("finoredesk:")) ??
      "",
    hint = custom.match(/finoredesk:([0-9a-f-]{36})/i)?.[1];
  const time = event.ts_event ?? event.ts;
  if (!time || !Number.isFinite(new Date(time * 1000).getTime()))
    return NextResponse.json({ error: "Missing event time." }, { status: 400 });
  const message = normaliseMessageId(event["message-id"]),
    key = createHash("sha256")
      .update(
        JSON.stringify([message, event.email.toLowerCase(), event.event, time]),
      )
      .digest("hex");
  const { data, error } = await adminClient().rpc("apply_web_email_event", {
    provider_message: message,
    delivery_hint: hint && z.uuid().safeParse(hint).success ? hint : null,
    event_key_value: key,
    event_name: event.event,
    event_time: new Date(time * 1000).toISOString(),
    recipient_email: event.email,
  });
  if (error)
    return NextResponse.json(
      { error: "Event update failed." },
      { status: 503 },
    );
  // An event may race the send response; let Brevo retry an unrecognised message.
  if (!data)
    return NextResponse.json(
      { error: "Delivery not yet registered." },
      { status: 503 },
    );
  return NextResponse.json({ received: true });
}
