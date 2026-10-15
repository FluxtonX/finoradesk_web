"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicConfig } from "@/lib/config";
import type { SupabaseClient } from "@supabase/supabase-js";
let instance: SupabaseClient | null = null;
export function browserClient() {
  const config = publicConfig();
  if (!config)
    throw new Error("Supabase is not configured. Follow web/README.md.");
  instance ??= createBrowserClient(config.url, config.key);
  return instance;
}
