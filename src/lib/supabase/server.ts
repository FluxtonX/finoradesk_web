import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicConfig } from "@/lib/config";

export async function serverClient() {
  const config = publicConfig();
  if (!config)
    throw new Error(
      "Supabase is not configured. Add web/.env.local using web/.env.example.",
    );
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          /* Proxy refreshes cookies for read-only server components. */
        }
      },
    },
  });
}
