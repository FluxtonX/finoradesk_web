import "server-only";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { publicConfig } from "@/lib/config";
export interface WebBilling {
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  plan_id: string | null;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}
export function billingConfigured() {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Billing is not connected yet.");
  if (key.startsWith("sk_live_") && process.env.BILLING_LIVE_ENABLED !== "true")
    throw new Error("Live billing has not been enabled.");
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 });
}
export function adminClient() {
  const config = publicConfig(),
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key)
    throw new Error("Server billing configuration is missing.");
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function siteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error("Set the website URL before connecting billing.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Use a secure website URL.");
  return url.origin;
}
