import { NextRequest, NextResponse } from "next/server";
import {
  secretMatches,
  runDeliveryWorker,
  deliveryEnabled,
} from "@/lib/server/delivery";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  if (
    !secretMatches(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  )
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!deliveryEnabled())
    return NextResponse.json(
      { error: "Delivery unavailable." },
      { status: 503 },
    );
  try {
    return NextResponse.json(await runDeliveryWorker());
  } catch {
    return NextResponse.json(
      { error: "Worker failed. Review server logs and queue state." },
      { status: 503 },
    );
  }
}
