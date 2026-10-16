import nextEnv from "@next/env";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { z } from "zod";

nextEnv.loadEnvConfig(process.cwd());
const file = new URL("../.env.local", import.meta.url);
const origin = new URL(process.argv[2] ?? "https://finoredesk-web.vercel.app")
  .origin;
const events = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
];
async function api(path, method = "GET", body) {
  const response = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `Resend setup request failed (HTTP ${response.status}). Check account permissions and provider logs.`,
    );
  return response.json();
}
async function save(values) {
  let source = await readFile(file, "utf8").catch(() => "");
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
  if (!origin.startsWith("https://"))
    throw new Error("Use an HTTPS webhook host.");
  if (!process.env.RESEND_API_KEY?.startsWith("re_"))
    throw new Error(
      "Add your original RESEND_API_KEY to ignored .env.local first.",
    );
  const recipients = (process.env.EMAIL_TEST_RECIPIENTS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (
    !recipients.length ||
    recipients.some((x) => !z.email().safeParse(x).success)
  )
    throw new Error(
      "Set EMAIL_TEST_RECIPIENTS to confirmed controlled inboxes first.",
    );
  const endpoint = `${origin}/api/email/webhook`;
  const webhooks = await api("/webhooks");
  // A shared Resend account may host unrelated products. Never modify their endpoints.
  let hook = webhooks.data?.find((item) => item.endpoint === endpoint);
  if (hook) {
    hook = await api(`/webhooks/${hook.id}`);
    if (
      hook.status !== "enabled" ||
      events.some((event) => !hook.events?.includes(event))
    ) {
      await api(`/webhooks/${hook.id}`, "PATCH", { status: "enabled", events });
    }
  } else {
    hook = await api("/webhooks", "POST", { endpoint, events });
  }
  const secret = hook.signing_secret ?? process.env.RESEND_WEBHOOK_SECRET;
  if (!secret?.startsWith("whsec_"))
    throw new Error(
      "Copy this endpoint's signing secret into RESEND_WEBHOOK_SECRET and rerun setup.",
    );
  await save({
    EMAIL_MODE: "test",
    EMAIL_FROM: process.env.EMAIL_FROM || "onboarding@resend.dev",
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME || "Finoredesk",
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO || recipients[0],
    EMAIL_TEST_RECIPIENTS: recipients.join(","),
    RESEND_WEBHOOK_ID: hook.id,
    RESEND_WEBHOOK_SECRET: secret,
    CRON_SECRET:
      process.env.CRON_SECRET || randomBytes(32).toString("base64url"),
  });
  console.log(
    JSON.stringify({
      mode: "test",
      webhook: endpoint,
      recipientCount: recipients.length,
      secrets: "Saved only in ignored .env.local; not printed.",
      scheduler: "Configure after deploying these server variables.",
    }),
  );
} catch (error) {
  console.error(
    error instanceof Error &&
      !error.message.includes(process.env.RESEND_API_KEY || "__no_key__")
      ? error.message
      : "Resend setup failed; review provider configuration.",
  );
  process.exitCode = 1;
}
