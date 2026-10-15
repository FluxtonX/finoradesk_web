import nextEnv from "@next/env";
import Stripe from "stripe";
import { readFile, writeFile, chmod } from "node:fs/promises";

nextEnv.loadEnvConfig(process.cwd());
const file = new URL("../.env.local", import.meta.url);
const origin = new URL(process.argv[2] ?? "https://finoredesk-web.vercel.app")
  .origin;
if (!origin.startsWith("https://"))
  throw new Error("Use an HTTPS webhook host.");
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"))
  throw new Error("This setup only accepts a Stripe test secret key.");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  timeout: 15000,
  maxNetworkRetries: 2,
});
async function save(values) {
  let source = await readFile(file, "utf8");
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    source = pattern.test(source)
      ? source.replace(pattern, () => line)
      : `${source.trimEnd()}\n${line}\n`;
    process.env[key] = value;
  }
  await writeFile(file, source, { mode: 0o600 });
  await chmod(file, 0o600);
}

try {
  const endpointUrl = `${origin}/api/billing/webhook`;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  let endpoint = endpoints.data.find(
    (item) => item.url === endpointUrl && item.status === "enabled",
  );
  if (endpoint && !process.env.STRIPE_WEBHOOK_SECRET)
    throw new Error(
      "The endpoint already exists. Copy its signing secret from Stripe into .env.local before rerunning.",
    );
  if (!endpoint) {
    endpoint = await stripe.webhookEndpoints.create({
      url: endpointUrl,
      api_version: Stripe.API_VERSION,
      enabled_events: [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "customer.subscription.paused",
        "customer.subscription.resumed",
      ],
      description: "Finoredesk test subscription updates",
      metadata: { application: "finoredesk" },
    });
    await save({ STRIPE_WEBHOOK_SECRET: endpoint.secret });
  }
  await save({ STRIPE_WEBHOOK_ENDPOINT_ID: endpoint.id });

  const configurations = await stripe.billingPortal.configurations.list({
    limit: 100,
  });
  let portal = configurations.data.find(
    (item) =>
      item.active &&
      item.metadata.application === "finoredesk" &&
      (!item.metadata.purpose || item.metadata.purpose === "management"),
  );
  if (!portal)
    portal = await stripe.billingPortal.configurations.create({
      name: "Finoredesk test billing",
      metadata: { application: "finoredesk", purpose: "management" },
      business_profile: { headline: "Manage your Finoredesk subscription" },
      default_return_url: `${origin}/workspace/billing`,
      features: {
        customer_update: {
          enabled: true,
          allowed_updates: ["address", "name", "tax_id"],
        },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
        // Plan changes originate in the app, where team capacity is checked.
        subscription_update: { enabled: false },
      },
    });
  await save({ STRIPE_PORTAL_CONFIGURATION_ID: portal.id });

  const rates = await stripe.taxRates.list({ active: true, limit: 100 });
  let rate = rates.data.find(
    (item) =>
      item.metadata.application === "finoredesk" &&
      item.inclusive &&
      item.percentage === 10 &&
      item.country === "AU",
  );
  if (!rate)
    rate = await stripe.taxRates.create({
      display_name: "GST",
      description: "Australian GST — inclusive test configuration",
      percentage: 10,
      inclusive: true,
      country: "AU",
      metadata: { application: "finoredesk" },
    });
  await save({
    STRIPE_GST_TAX_RATE_ID: rate.id,
    BILLING_TAX_MODE: "inclusive",
    BILLING_LIVE_ENABLED: "false",
    STRIPE_AUTOMATIC_TAX: "false",
  });
  console.log(
    JSON.stringify({
      mode: "test",
      webhook: endpoint.url,
      portalConfigured: true,
      inclusiveGstConfigured: true,
      liveBillingEnabled: false,
      secrets: "Saved only in ignored .env.local; not printed.",
    }),
  );
} catch (error) {
  // SDK errors can contain request details; never dump them with credentials loaded.
  console.error(
    error instanceof Stripe.errors.StripeError
      ? `Stripe setup failed (${error.type}, ${error.code ?? "no code"}). Check the Stripe request log.`
      : error.message,
  );
  process.exitCode = 1;
}
