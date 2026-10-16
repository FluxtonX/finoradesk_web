import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/server/billing";
import { verifyResendEvent } from "@/lib/domain/resend-webhook";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "Email callbacks unavailable." },
      { status: 503 },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 65536)
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 65536)
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  let event;
  try {
    event = verifyResendEvent(
      raw,
      {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      },
      secret,
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid signed event." },
      { status: 400 },
    );
  }
  // Unrelated applications may share this Resend account.
  if (!event) return NextResponse.json({ received: true, ignored: true });
  try {
    const { data, error } = await adminClient().rpc(
      "apply_web_resend_event",
      event,
    );
    if (error || !data)
      return NextResponse.json(
        { error: "Delivery not yet registered." },
        { status: 503 },
      );
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: "Event update unavailable." },
      { status: 503 },
    );
  }
}
