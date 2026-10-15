import { requireAdmin } from "@/lib/server/context";
import { NextResponse } from "next/server";
export async function GET() {
  const { db, organization } = await requireAdmin();
  const { data, error } = await db.functions.invoke("data-export", {
    body: { org: organization.id },
  });
  if (error)
    return NextResponse.json(
      { error: "Export unavailable. Check function deployment and retry." },
      { status: 503 },
    );
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="finoredesk-business.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
