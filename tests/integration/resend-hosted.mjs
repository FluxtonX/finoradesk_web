// Explicit, opt-in provider acceptance. All financial fixtures stay in this test.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  unlink,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";

nextEnv.loadEnvConfig(process.cwd());
const origin = "https://finoredesk-web.vercel.app";
const stateFile = "/tmp/finoredesk-resend-hosted-state.json";
const mode = process.argv[2] ?? "status";
const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  clientOptions,
);
const recipient = (process.env.EMAIL_TEST_RECIPIENTS ?? "")
  .trim()
  .toLowerCase();
let state;
function checked(result) {
  if (result.error)
    throw new Error(
      `Hosted API rejected operation (${result.error.code ?? result.error.status ?? "unknown"}).`,
    );
  return result.data;
}
async function save() {
  await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
}
async function pass(label) {
  if (!state.checks.includes(label)) state.checks.push(label);
  await save();
  console.log(JSON.stringify({ passed: label }));
}
async function actor() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    clientOptions,
  );
  const { session } = checked(await db.auth.setSession(state.session));
  state.session = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  };
  await save();
  return db;
}
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, ""))
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", key).update(time).digest();
  return ((hash.readUInt32BE(hash.at(-1) & 15) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
async function postWorker() {
  const response = await fetch(`${origin}/api/jobs/invoice-delivery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(
    response.status,
    200,
    "Configured worker must respond successfully.",
  );
  return response.json();
}
async function delivery(id) {
  return checked(
    await admin
      .from("web_email_deliveries")
      .select("*")
      .eq("id", id)
      .eq("organization_id", state.orgId)
      .single(),
  );
}
async function providerEmail(id) {
  const response = await fetch(`https://api.resend.com/emails/${id}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200, "Provider email lookup must succeed.");
  return response.json();
}
async function sql(text) {
  const directory = await mkdtemp(`${tmpdir()}/finoredesk-email-acceptance-`);
  try {
    const file = `${directory}/query.sql`;
    await writeFile(file, text, { mode: 0o600 });
    const output = execFileSync(
      "supabase",
      ["db", "query", "--linked", "--file", file, "--output", "json", "--yes"],
      {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 90000,
      },
    ).toString();
    return JSON.parse(output.slice(output.indexOf("{"))).rows;
  } catch {
    throw new Error(
      "Dedicated fixture SQL operation failed; no credentials printed.",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
try {
  assert.equal(
    process.env.RUN_HOSTED_EMAIL_TEST,
    "true",
    "Explicit opt-in is required.",
  );
  assert.equal(
    process.env.EMAIL_MODE,
    "test",
    "Only allowlisted test mode is allowed.",
  );
  assert.ok(process.env.RESEND_API_KEY?.startsWith("re_"));
  assert.ok(
    recipient && !recipient.includes(","),
    "Use exactly one confirmed controlled inbox.",
  );
  state = await readFile(stateFile, "utf8")
    .then(JSON.parse)
    .catch(() => null);
  if (mode === "prepare") {
    assert.equal(
      state,
      null,
      "An acceptance fixture already exists; inspect it before creating another.",
    );
    const tag = randomUUID();
    const email = `finoredesk-resend-${tag}@example.test`;
    const password = `${randomUUID()}Aa1!`;
    const { user } = checked(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: "Resend acceptance",
          integration_test: true,
        },
      }),
    );
    state = { tag, userId: user.id, checks: [] };
    await save();
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      clientOptions,
    );
    checked(await db.auth.signInWithPassword({ email, password }));
    const factor = checked(
      await db.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Email test authenticator",
      }),
    );
    checked(
      await db.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: totp(factor.totp.secret),
      }),
    );
    const { session } = checked(await db.auth.getSession());
    state.session = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
    state.orgId = checked(
      await db.rpc("create_organization", {
        business_name: `Finoredesk Resend TEST ${tag}`,
        business_timezone: "Australia/Sydney",
      }),
    );
    await save();
    const contact = checked(
      await db
        .from("contacts")
        .insert({
          organization_id: state.orgId,
          type: "customer",
          name: "Controlled email test recipient",
          email: recipient,
          notes: "Automated acceptance fixture; no payment is due.",
        })
        .select("id")
        .single(),
    );
    const day = (offset) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Sydney",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() + offset * 86400000));
    state.invoiceId = checked(
      await db.rpc("save_invoice", {
        org: state.orgId,
        invoice_id: randomUUID(),
        customer_id: contact.id,
        issued: day(-20),
        due: day(-10),
        line_items: [
          {
            description: "TEST ONLY — email/PDF verification, no payment due",
            quantity: "1",
            unit_cents: 1234,
            tax_mode: "gst_free",
          },
        ],
        invoice_notes:
          "TEST ONLY. This is a delivery verification invoice. No payment is due. Please do not pay.",
      }),
    );
    await save();
    checked(
      await db.rpc("issue_invoice", {
        org: state.orgId,
        target_invoice: state.invoiceId,
      }),
    );
    const key = randomUUID();
    const args = {
      org: state.orgId,
      target_invoice: state.invoiceId,
      job_kind: "invoice",
      idempotency_key: key,
    };
    state.deliveryId = checked(
      await db.rpc("request_web_invoice_delivery", args),
    );
    assert.equal(
      checked(await db.rpc("request_web_invoice_delivery", args)),
      state.deliveryId,
    );
    await pass("authenticated invoice request is idempotent");
    console.log(
      JSON.stringify({
        orgId: state.orgId,
        invoiceId: state.invoiceId,
        deliveryId: state.deliveryId,
      }),
    );
  } else {
    assert.ok(state?.orgId, "Prepare a dedicated fixture first.");
    assert.match(state.orgId, /^[0-9a-f-]{36}$/);
    const org = checked(
      await admin
        .from("organizations")
        .select("name,active")
        .eq("id", state.orgId)
        .single(),
    );
    assert.equal(
      org.name,
      `Finoredesk Resend TEST ${state.tag}`,
      "Only the dedicated fixture may be touched.",
    );
    if (mode === "send") {
      console.log(JSON.stringify({ worker: await postWorker() }));
      const job = await delivery(state.deliveryId);
      assert.ok(
        ["accepted", "delivered"].includes(job.state),
        `Invoice state: ${job.state}; ${job.last_error ?? ""}`,
      );
      assert.equal(job.provider, "resend");
      assert.ok(job.message_id);
      const bytes = Buffer.from(job.payload.attachments[0].content, "base64");
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
      assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1);
      assert.equal(job.payload.to[0], recipient);
      assert.match(job.payload.text, /12\.34/);
      assert.match(job.payload.text, /No payment is due/);
      await mkdir("test-results", { recursive: true });
      await writeFile("test-results/resend-issued-invoice.pdf", bytes);
      state.messageId = job.message_id;
      await pass(
        "deployed worker sends exact invoice PDF to the controlled allowlist",
      );
    } else if (mode === "check") {
      const jobs = checked(
        await admin
          .from("web_email_deliveries")
          .select("id,kind,state,message_id,last_error")
          .eq("organization_id", state.orgId)
          .order("created_at"),
      );
      for (const job of jobs) {
        let provider;
        if (job.message_id) provider = await providerEmail(job.message_id);
        console.log(
          JSON.stringify({
            kind: job.kind,
            state: job.state,
            providerEvent: provider?.last_event,
            error: job.last_error,
          }),
        );
        if (job.state === "delivered" && provider?.last_event === "delivered")
          await pass(
            `${job.kind} delivery confirmed by real provider callback`,
          );
      }
    } else if (mode === "reminder") {
      const db = await actor();
      const next = checked(
        await db.rpc("set_web_reminder", {
          org: state.orgId,
          target_invoice: state.invoiceId,
          opt_in: true,
        }),
      );
      assert.equal(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Australia/Sydney",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date(next)),
        "09:00",
      );
      await pass("opt-in reminder schedules 09:00 business time");
      checked(
        await admin
          .from("web_reminder_schedules")
          .update({ next_run_at: new Date(Date.now() - 60000).toISOString() })
          .eq("organization_id", state.orgId)
          .eq("invoice_id", state.invoiceId),
      );
      // The installed five-minute scheduler must generate and dispatch this fixture.
      await pass("dedicated reminder advanced for scheduler acceptance only");
    } else if (mode === "security") {
      assert.equal(
        (await fetch(`${origin}/api/jobs/invoice-delivery`, { method: "POST" }))
          .status,
        401,
      );
      assert.equal(
        (
          await fetch(`${origin}/api/email/webhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
        400,
      );
      await pass(
        "deployed worker and callback reject unauthenticated or forged requests",
      );
      const db = await actor();
      const result = await db.rpc("claim_web_deliveries");
      assert.ok(result.error);
      const foreign = await db.rpc("request_web_invoice_delivery", {
        org: randomUUID(),
        target_invoice: state.invoiceId,
        job_kind: "invoice",
        idempotency_key: randomUUID(),
      });
      assert.ok(foreign.error);
      await pass("hosted queue and cross-tenant mutation are protected");
      const key = `resend:acceptance-${randomUUID()}`;
      const payload = {
        type: "email.delivered",
        created_at: new Date().toISOString(),
        data: {
          email_id: state.messageId,
          to: [recipient],
          tags: { application: "finoredesk", delivery_id: state.deliveryId },
        },
      };
      const raw = JSON.stringify(payload),
        stamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac(
        "sha256",
        Buffer.from(
          process.env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ""),
          "base64",
        ),
      )
        .update(`${key}.${stamp}.${raw}`)
        .digest("base64");
      const request = () =>
        fetch(`${origin}/api/email/webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "svix-id": key,
            "svix-timestamp": stamp,
            "svix-signature": `v1,${signature}`,
          },
          body: raw,
        });
      assert.equal((await request()).status, 200);
      assert.equal((await request()).status, 200);
      const events = checked(
        await admin
          .from("web_email_events")
          .select("event_key")
          .eq("event_key", `resend:${key}`),
      );
      assert.equal(events.length, 1);
      await pass("signed duplicate callback is applied once");
    } else if (mode === "schedule") {
      const schedule = checked(
        await admin
          .from("web_reminder_schedules")
          .select("*")
          .eq("organization_id", state.orgId)
          .single(),
      );
      assert.equal(schedule.runs, 1, "Exactly one reminder must be generated.");
      assert.equal(schedule.enabled, true);
      const nextDate = new Date(schedule.next_run_at);
      assert.equal(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Australia/Sydney",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(nextDate),
        "09:00",
      );
      const calendar = (date) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Australia/Sydney",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(date);
      assert.equal(
        calendar(nextDate),
        calendar(new Date(Date.now() + 7 * 86400000)),
      );
      await pass(
        "hosted reminder advances weekly at 09:00 after one scheduled send",
      );
      const rows = await sql(
        "select j.jobname,r.status,h.status_code,h.timed_out,h.content from cron.job j join cron.job_run_details r on r.jobid=j.jobid cross join lateral (select status_code,timed_out,content from net._http_response where created>=r.start_time order by created limit 1) h where j.jobname='finoredesk-web-invoice-delivery' and r.status='succeeded' order by r.start_time desc limit 1;",
      );
      assert.ok(rows.length);
      assert.equal(rows[0].status_code, 200);
      assert.equal(rows[0].timed_out, false);
      assert.equal(JSON.parse(rows[0].content).claimed, 1);
      await pass(
        "actual hosted Cron and pg_net HTTP run dispatch the reminder",
      );
    } else if (mode === "allowlist") {
      assert.ok(
        state.checks.includes(
          "reminder delivery confirmed by real provider callback",
        ),
        "Finish scheduled reminder acceptance before this check.",
      );
      const db = await actor();
      const contact = checked(
        await db
          .from("contacts")
          .insert({
            organization_id: state.orgId,
            type: "customer",
            name: "TEST outside allowlist",
            email: "outside-allowlist@example.test",
          })
          .select("id")
          .single(),
      );
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Sydney",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const invoice = checked(
        await db.rpc("save_invoice", {
          org: state.orgId,
          invoice_id: randomUUID(),
          customer_id: contact.id,
          issued: day,
          due: day,
          line_items: [
            {
              description: "TEST only; never dispatched",
              quantity: "1",
              unit_cents: 1,
              tax_mode: "gst_free",
            },
          ],
          invoice_notes: "TEST ONLY; no payment is due.",
        }),
      );
      checked(
        await db.rpc("issue_invoice", {
          org: state.orgId,
          target_invoice: invoice,
        }),
      );
      const id = checked(
        await db.rpc("request_web_invoice_delivery", {
          org: state.orgId,
          target_invoice: invoice,
          job_kind: "invoice",
          idempotency_key: randomUUID(),
        }),
      );
      await postWorker();
      const job = await delivery(id);
      assert.equal(job.state, "failed");
      assert.equal(job.message_id, null);
      assert.match(job.last_error, /allowlist/);
      await pass(
        "deployed test mode blocks outside recipients before provider submission",
      );
    } else if (mode === "stop") {
      const db = await actor();
      checked(
        await db.rpc("set_web_reminder", {
          org: state.orgId,
          target_invoice: state.invoiceId,
          opt_in: false,
        }),
      );
      const schedule = checked(
        await admin
          .from("web_reminder_schedules")
          .select("*")
          .eq("organization_id", state.orgId)
          .single(),
      );
      assert.equal(schedule.opted_in, false);
      assert.equal(schedule.enabled, false);
      await pass("reminder consent can be withdrawn on hosted backend");
      checked(
        await db.rpc("record_payment", {
          org: state.orgId,
          target_invoice: state.invoiceId,
          cents: 1234,
          paid_on: new Intl.DateTimeFormat("en-CA", {
            timeZone: "Australia/Sydney",
          }).format(new Date()),
          payment_reference: "TEST ONLY; no funds transferred",
          idempotency_key: randomUUID(),
        }),
      );
      const result = await db.rpc("set_web_reminder", {
        org: state.orgId,
        target_invoice: state.invoiceId,
        opt_in: true,
      });
      assert.ok(result.error);
      await pass("paid invoice cannot enable further reminders");
    } else if (mode === "paid-void-stop") {
      const db = await actor();
      const contact = checked(
        await db
          .from("contacts")
          .insert({
            organization_id: state.orgId,
            type: "customer",
            name: "TEST reminder cancellation",
            email: recipient,
          })
          .select("id")
          .single(),
      );
      const day = (offset) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Australia/Sydney",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(Date.now() + offset * 86400000));
      for (const stop of ["payment", "void"]) {
        const id = checked(
          await db.rpc("save_invoice", {
            org: state.orgId,
            invoice_id: randomUUID(),
            customer_id: contact.id,
            issued: day(-20),
            due: day(-10),
            line_items: [
              {
                description: "TEST reminder cancellation; no payment due",
                quantity: "1",
                unit_cents: 1,
                tax_mode: "gst_free",
              },
            ],
            invoice_notes: "TEST ONLY. No payment is due.",
          }),
        );
        checked(
          await db.rpc("issue_invoice", {
            org: state.orgId,
            target_invoice: id,
          }),
        );
        checked(
          await db.rpc("set_web_reminder", {
            org: state.orgId,
            target_invoice: id,
            opt_in: true,
          }),
        );
        const queued = checked(
          await db.rpc("request_web_invoice_delivery", {
            org: state.orgId,
            target_invoice: id,
            job_kind: "reminder",
            idempotency_key: randomUUID(),
          }),
        );
        if (stop === "payment")
          checked(
            await db.rpc("record_payment", {
              org: state.orgId,
              target_invoice: id,
              cents: 1,
              paid_on: day(0),
              payment_reference: "TEST ONLY; no funds transferred",
              idempotency_key: randomUUID(),
            }),
          );
        else
          checked(
            await db.rpc("void_invoice", {
              org: state.orgId,
              target_invoice: id,
              reason: "TEST ONLY; verify queued reminder cancellation",
            }),
          );
        await postWorker();
        const job = await delivery(queued);
        assert.equal(job.state, "cancelled");
        assert.equal(job.message_id, null);
        await pass(`deployed worker cancels a queued reminder after ${stop}`);
      }
    } else if (mode === "cleanup") {
      assert.ok(
        state.checks.includes(
          "invoice delivery confirmed by real provider callback",
        ) &&
          state.checks.includes(
            "reminder delivery confirmed by real provider callback",
          ),
        "Record real provider callback acceptance before cleanup.",
      );
      await sql(
        `begin; update public.web_reminder_schedules set enabled=false,opted_in=false where organization_id='${state.orgId}'; update public.organizations set active=false where id='${state.orgId}' and name like 'Finoredesk Resend TEST %';commit;select active from public.organizations where id='${state.orgId}';`,
      );
      checked(
        await admin.auth.admin.updateUserById(state.userId, {
          ban_duration: "876000h",
        }),
      );
      const evidence = {
        date: "2026-10-16",
        provider: "resend",
        mode: "test",
        orgId: state.orgId,
        checks: state.checks,
        fixtureDisabled: true,
        actualInboxPlacementVerified: false,
        realMoneyTransferred: false,
      };
      await mkdir("test-results", { recursive: true });
      await writeFile(
        "test-results/resend-acceptance.json",
        JSON.stringify(evidence, null, 2) + "\n",
      );
      await unlink(stateFile);
      console.log(
        JSON.stringify({
          fixtureDisabled: true,
          checksPassed: state.checks.length,
          temporaryCredentialsRemoved: true,
        }),
      );
    } else if (mode === "status") {
      console.log(
        JSON.stringify({
          orgId: state.orgId,
          active: org.active,
          checks: state.checks,
        }),
      );
    } else throw new Error("Unknown acceptance mode.");
  }
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Unknown acceptance failure.";
  const secrets = [
    process.env.RESEND_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.CRON_SECRET,
    process.env.RESEND_WEBHOOK_SECRET,
  ].filter(Boolean);
  console.error(
    secrets.some((value) => message.includes(value))
      ? "Acceptance failed; credentials suppressed."
      : message,
  );
  process.exitCode = 1;
}
