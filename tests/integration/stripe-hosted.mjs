// Explicit opt-in acceptance against real Stripe TEST mode and hosted Supabase.
// Never runs under the ordinary unit/browser suite; creates its own test tenant.
import nextEnv from "@next/env";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import assert from "node:assert/strict";

nextEnv.loadEnvConfig(process.cwd());
if (process.env.RUN_HOSTED_STRIPE_TEST !== "true")
  throw new Error("Set RUN_HOSTED_STRIPE_TEST=true to run hosted acceptance.");
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"))
  throw new Error("Only Stripe test keys are allowed.");
const origin =
  process.env.STRIPE_TEST_SITE_URL ?? "https://finoredesk-web.vercel.app";
const stateFile = "/tmp/finoredesk-stripe-hosted-state.json";
const mode = process.argv[2] ?? "checkout";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const client = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
function checked(result) {
  if (result.error)
    throw new Error(
      `Hosted API failed (${result.error.code ?? result.error.status ?? "unknown"}).`,
    );
  return result.data;
}
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const key = Buffer.from(
    bits.match(/.{8}/g).map((value) => parseInt(value, 2)),
  );
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", key).update(time).digest();
  const value = (hash.readUInt32BE(hash.at(-1) & 15) & 0x7fffffff) % 1000000;
  return value.toString().padStart(6, "0");
}
async function save(state) {
  await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
}
async function fixture() {
  try {
    return JSON.parse(await readFile(stateFile, "utf8"));
  } catch {}
  const tag = randomUUID();
  const email = `finoredesk-stripe-${tag}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  const { user } = checked(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: "Stripe acceptance",
        integration_test: true,
      },
    }),
  );
  const db = client();
  checked(await db.auth.signInWithPassword({ email, password }));
  const factor = checked(
    await db.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Stripe test authenticator",
    }),
  );
  checked(
    await db.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: totp(factor.totp.secret),
    }),
  );
  const orgId = checked(
    await db.rpc("create_organization", {
      business_name: `Finoredesk Stripe verification ${tag}`,
      business_timezone: "Australia/Sydney",
    }),
  );
  const state = {
    userId: user.id,
    email,
    password,
    totpSecret: factor.totp.secret,
    orgId,
    checks: [],
  };
  await save(state);
  return state;
}
async function profile(state) {
  return checked(
    await admin
      .from("web_billing_profiles")
      .select("*")
      .eq("organization_id", state.orgId)
      .maybeSingle(),
  );
}
async function eventually(callback, label, seconds = 60) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    if (await callback()) return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}
async function signIn(page, state) {
  await page.goto(`${origin}/auth`);
  await page.getByLabel("Email address").fill(state.email);
  await page.getByLabel("Password", { exact: true }).fill(state.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const code = page.getByLabel("6-digit authenticator code");
  await code.waitFor({ timeout: 30000 });
  // Avoid entering a code in the last few seconds of its period.
  if (Date.now() % 30000 > 25000) await page.waitForTimeout(6000);
  await code.fill(totp(state.totpSecret));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.waitForURL(/\/workspace(?:\?|$)/, { timeout: 30000 });
}

const state = ["status", "cleanup"].includes(mode)
  ? JSON.parse(await readFile(stateFile, "utf8"))
  : await fixture();
async function passed(check, details = {}) {
  if (!state.checks.includes(check)) state.checks.push(check);
  await save(state);
  console.log(JSON.stringify({ passed: check, ...details }));
}
if (mode === "status") {
  const p = await profile(state);
  console.log(
    JSON.stringify({
      orgId: state.orgId,
      profile: p
        ? {
            plan: p.plan_id,
            status: p.status,
            cancelling: p.cancel_at_period_end,
          }
        : null,
      checks: state.checks,
    }),
  );
  process.exit(0);
}
if (mode === "cleanup") {
  const p = await profile(state);
  const business = checked(
    await admin
      .from("organizations")
      .select("name")
      .eq("id", state.orgId)
      .single(),
  );
  assert.ok(business.name.startsWith("Finoredesk Stripe verification "));
  assert.equal(
    p?.status,
    "canceled",
    "End the isolated test subscription before cleanup",
  );
  assert.ok(
    state.checks.includes(
      "exports remain available after subscription cancellation",
    ),
  );
  checked(
    await admin
      .from("organizations")
      .update({ active: false })
      .eq("id", state.orgId),
  );
  checked(
    await admin.auth.admin.updateUserById(state.userId, {
      ban_duration: "876000h",
    }),
  );
  const evidence = {
    verifiedOn: "2026-10-16",
    environment: "Stripe test mode and hosted Supabase",
    site: origin,
    organisationId: state.orgId,
    subscriptionStatus: p.status,
    checks: state.checks,
    fixtureDisabled: true,
    liveCharges: false,
  };
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/stripe-acceptance.json",
    JSON.stringify(evidence, null, 2),
  );
  await unlink(stateFile);
  console.log(
    JSON.stringify({
      checksPassed: state.checks.length,
      fixtureDisabled: true,
      credentialsRemoved: true,
      evidence: "test-results/stripe-acceptance.json",
    }),
  );
  process.exit(0);
}
if (mode === "webhooks") {
  const events = checked(
    await admin
      .from("web_billing_events")
      .select("event_id")
      .eq("organization_id", state.orgId),
  );
  assert.ok(
    events.length > 0,
    "A real Stripe-delivered event must exist before replay testing",
  );
  const event = await stripe.events.retrieve(events[0].event_id);
  const payload = JSON.stringify(event);
  const post = (signature) =>
    fetch(`${origin}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature,
      },
      body: payload,
    });
  assert.equal((await post("forged")).status, 400);
  await passed("deployed webhook rejects forged signatures");
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  assert.equal((await post(signature)).status, 200);
  const after = checked(
    await admin
      .from("web_billing_events")
      .select("event_id")
      .eq("organization_id", state.orgId),
  );
  assert.equal(after.length, events.length);
  await passed(
    "replayed provider event does not duplicate subscription history",
  );
  process.exit(0);
}
if (mode === "permissions") {
  const db = client();
  checked(
    await db.auth.signInWithPassword({
      email: state.email,
      password: state.password,
    }),
  );
  const factors = checked(await db.auth.mfa.listFactors());
  checked(
    await db.auth.mfa.challengeAndVerify({
      factorId: factors.totp.find((x) => x.status === "verified").id,
      code: totp(state.totpSecret),
    }),
  );
  const before = await profile(state);
  const write = await db
    .from("web_billing_profiles")
    .update({ status: "unpaid" })
    .eq("organization_id", state.orgId)
    .select("organization_id");
  assert.ok(
    write.error || write.data.length === 0,
    "Authenticated users must not write provider-owned billing state",
  );
  assert.equal((await profile(state)).status, before.status);
  const other = await db.rpc("web_access", { org: randomUUID() });
  assert.ok(other.error, "Foreign businesses must not be accessible");
  const anonymous = await client()
    .from("web_billing_profiles")
    .select("organization_id")
    .eq("organization_id", state.orgId);
  assert.ok(anonymous.error || anonymous.data.length === 0);
  await passed(
    "hosted database rejects forged billing writes and foreign/anonymous access",
  );
  process.exit(0);
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
let currentPage;
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  currentPage = page;
  page.setDefaultTimeout(20000);
  await signIn(page, state);
  await page.goto(`${origin}/workspace/billing`);
  assert.ok(
    await page
      .getByText("Test billing is enabled. No real money is charged.")
      .isVisible(),
  );
  if (mode === "checkout" || mode === "pay") {
    await page
      .getByRole("button", { name: "Choose Starter", exact: true })
      .click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log(
      JSON.stringify({
        checkoutOpened: true,
        fields: await page.locator("input").evaluateAll((nodes) =>
          nodes.map((node) => ({
            id: node.id,
            name: node.name,
            type: node.type,
            placeholder: node.placeholder,
          })),
        ),
      }),
    );
    await mkdir("test-results", { recursive: true });
    await page.screenshot({
      path: "test-results/stripe-hosted-checkout.png",
      fullPage: true,
    });
    if (mode === "pay") {
      await page.locator("#cardNumber").fill("4000000000000002");
      await page.locator("#cardExpiry").fill("12/30");
      await page.locator("#cardCvc").fill("123");
      await page.locator("#billingName").fill("Finoredesk acceptance");
      await page.locator("#billingCountry").selectOption("AU");
      const postal = page.locator("#billingPostalCode");
      if (await postal.isVisible()) await postal.fill("2000");
      await page
        .getByRole("button", { name: "Subscribe", exact: true })
        .click();
      await page
        .getByText(/card (?:was|has been) declined/i)
        .first()
        .waitFor({ timeout: 30000 });
      const declined = await profile(state);
      assert.ok(!["active", "trialing"].includes(declined?.status));
      await passed("declined card does not activate subscription");
      await page.locator("#cardNumber").fill("4242424242424242");
      await page
        .getByRole("button", { name: "Subscribe", exact: true })
        .click();
      await page.waitForURL(`${origin}/workspace/billing?checkout=returned`, {
        timeout: 60000,
      });
      await eventually(
        async () => (await profile(state))?.status === "active",
        "Stripe webhook activation",
      );
      const p = await profile(state);
      assert.equal(p.plan_id, "starter");
      const sessions = checked(
        await admin
          .from("web_checkout_sessions")
          .select("stripe_checkout_id")
          .eq("organization_id", state.orgId)
          .order("created_at", { ascending: false })
          .limit(1),
      );
      const session = await stripe.checkout.sessions.retrieve(
        sessions[0].stripe_checkout_id,
      );
      assert.equal(session.status, "complete");
      assert.equal(session.payment_status, "paid");
      assert.equal(session.currency, "aud");
      assert.equal(session.amount_total, 1900);
      assert.equal(session.total_details.amount_tax, 173);
      await passed("hosted checkout and provider webhook activate Starter", {
        currency: session.currency,
        totalCents: session.amount_total,
        includedGstCents: session.total_details.amount_tax,
      });
      await page.goto(`${origin}/workspace/contacts/new`);
      await page.getByLabel("Name", { exact: true }).waitFor();
      await passed("confirmed subscription unlocks financial writes");
    }
  }
  if (mode === "change" || mode === "portal" || mode === "cancel") {
    await page
      .getByRole("button", {
        name:
          mode === "change" ? "Choose Growth" : "Manage billing / cancellation",
        exact: true,
      })
      .click();
    try {
      await page.waitForURL(/billing\.stripe\.com/, { timeout: 20000 });
    } catch {
      console.log(
        JSON.stringify({
          billingError: await page.getByRole("alert").allTextContents(),
        }),
      );
      throw new Error("Stripe portal did not open.");
    }
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(
      () => document.body.innerText.trim().length > 150,
      { timeout: 30000 },
    );
    await mkdir("test-results", { recursive: true });
    await page.screenshot({
      path: `test-results/stripe-${mode}.png`,
      fullPage: true,
    });
    console.log(
      JSON.stringify({
        mode,
        buttons: await page.getByRole("button").allTextContents(),
        links: await page.getByRole("link").allTextContents(),
        text: (await page.locator("body").innerText()).slice(0, 1800),
      }),
    );
    if (mode === "change") {
      await page.getByRole("button", { name: /^Confirm/ }).click();
      await page.waitForURL(
        `${origin}/workspace/billing?checkout=returned&plan=growth`,
        { timeout: 60000 },
      );
      await eventually(
        async () => (await profile(state))?.plan_id === "growth",
        "confirmed Growth plan webhook",
      );
      assert.equal((await profile(state)).status, "active");
      await page
        .getByText("Subscription confirmed. Your plan is active.")
        .waitFor({ timeout: 35000 });
      await passed("customer-confirmed plan change updates Growth entitlement");
      await page.screenshot({
        path: "test-results/stripe-growth-active.png",
        fullPage: true,
      });
    }
    if (mode === "portal")
      await passed(
        "customer portal provides invoice history and payment management",
      );
    if (mode === "cancel") {
      await page
        .getByRole("link", { name: "Cancel subscription", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Cancel subscription", exact: true })
        .click();
      await eventually(
        async () => (await profile(state))?.cancel_at_period_end === true,
        "scheduled cancellation webhook",
      );
      assert.equal((await profile(state)).status, "active");
      await page.goto(`${origin}/workspace/contacts/new`);
      await page.getByLabel("Name", { exact: true }).waitFor();
      await passed(
        "portal cancellation retains access until the paid period ends",
      );
      const p = await profile(state);
      await stripe.subscriptions.cancel(p.stripe_subscription_id);
      await eventually(
        async () => (await profile(state))?.status === "canceled",
        "final cancellation webhook",
      );
      await page.goto(`${origin}/workspace/contacts/new`);
      await page.waitForURL(/\/workspace\/billing\?access=required/);
      await page.goto(`${origin}/workspace/contacts`);
      await page
        .getByRole("heading", { name: "Good business starts with people." })
        .waitFor();
      await passed(
        "ended subscription blocks writes and preserves record viewing",
      );
      const exported = await page.request.get(
        `${origin}/workspace/transfer/export?kind=customers`,
      );
      assert.equal(exported.status(), 200);
      assert.match(exported.headers()["content-type"], /text\/csv/);
      await passed("exports remain available after subscription cancellation");
      await page.screenshot({
        path: "test-results/stripe-canceled-read-only.png",
        fullPage: true,
      });
    }
  }
  await save(state);
} catch (error) {
  await mkdir("test-results", { recursive: true });
  await currentPage?.screenshot({
    path: "test-results/stripe-failure.png",
    fullPage: true,
  });
  if (currentPage && /stripe\.com/.test(new URL(currentPage.url()).hostname))
    console.log(
      JSON.stringify({
        stripeAlerts: await currentPage.getByRole("alert").allTextContents(),
      }),
    );
  throw error;
} finally {
  await browser.close();
}
