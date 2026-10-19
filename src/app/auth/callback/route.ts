import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/config";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code"),
    next = safeNext(request.nextUrl.searchParams.get("next"));
  let destination =
    "/auth?error=This+link+has+expired.+Please+request+a+new+one.";
  if (code) {
    const db = await serverClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) destination = next;
  }
  // Preserve the browser's origin, including when a proxy uses an internal host.
  return new NextResponse(null, {
    status: 307,
    headers: { Location: destination },
  });
}
