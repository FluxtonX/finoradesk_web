import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicConfig } from "@/lib/config";

export async function proxy(request: NextRequest) {
  const config = publicConfig();
  if (!config) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  // Validate/refresh credentials; protected server operations also verify independently.
  await supabase.auth.getUser();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: ["/workspace/:path*", "/onboarding", "/security", "/auth/:path*"],
};
