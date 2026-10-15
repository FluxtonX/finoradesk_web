import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/config";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code"),
    next = safeNext(request.nextUrl.searchParams.get("next"));
  if (code) {
    const db = await serverClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(
    new URL(
      "/auth?error=This+link+has+expired.+Please+request+a+new+one.",
      request.url,
    ),
  );
}
