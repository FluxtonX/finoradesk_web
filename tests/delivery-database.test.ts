import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
let db: PGlite;
const user = "10000000-0000-4000-8000-000000000011";
let org: string, invoice: string, delivery: string;
async function actor() {
  await db.exec("set role authenticated");
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [user]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth to authenticated,service_role;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    insert into auth.users values('${user}','owner@example.test',now());`);
  for (const name of [
    "202610140001_foundation.sql",
    "202610140002_invoicing.sql",
    "202610150013_web_delivery.sql",
  ])
    await db.exec(await readFile(`../supabase/migrations/${name}`, "utf8"));
  await db.exec(
    "grant usage on schema public to service_role;grant all on all tables in schema public to service_role;grant usage,select on all sequences in schema public to service_role;",
  );
  await actor();
  org = (
    await db.query<{ id: string }>(
      `select public.create_organization('Mail SQL test',null,true) as id`,
    )
  ).rows[0].id;
  const customer = (
    await db.query<{ id: string }>(
      `insert into public.contacts(organization_id,type,name,email) values($1,'customer','Recipient','recipient@example.test') returning id`,
      [org],
    )
  ).rows[0].id;
  invoice = (
    await db.query<{ id: string }>(
      `select public.save_invoice($1,null,$2,current_date-20,current_date-10,'[{"description":"Service","quantity":"1","unit_cents":10000,"tax_mode":"exclusive"}]') as id`,
      [org, customer],
    )
  ).rows[0].id;
  await db.query(`select public.issue_invoice($1,$2)`, [org, invoice]);
});
afterAll(async () => {
  await db?.close();
});
describe("web email and reminder SQL", () => {
  it("deduplicates requests and rejects cross-tenant invoice IDs", async () => {
    const key = randomUUID();
    const request = () =>
      db.query<{ id: string }>(
        `select public.request_web_invoice_delivery($1,$2,'invoice',$3) as id`,
        [org, invoice, key],
      );
    delivery = (await request()).rows[0].id;
    expect((await request()).rows[0].id).toBe(delivery);
    await expect(
      db.query(
        `select public.request_web_invoice_delivery($1,$2,'invoice',$3)`,
        [randomUUID(), invoice, randomUUID()],
      ),
    ).rejects.toThrow("Permission denied");
  });
  it("prevents clients claiming or forging delivery state", async () => {
    await expect(
      db.query("select public.claim_web_deliveries()"),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query(`update public.web_email_deliveries set state='delivered'`),
    ).rejects.toThrow("permission denied");
  });
  it("claims each queued job once and quarantines expired leases", async () => {
    await db.exec("set role service_role");
    expect(
      (await db.query("select * from public.claim_web_deliveries()")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.claim_web_deliveries()")).rows,
    ).toHaveLength(0);
    await db.query(
      `update public.web_email_deliveries set leased_until=now()-interval '1 minute' where id=$1`,
      [delivery],
    );
    await db.query("select * from public.claim_web_deliveries()");
    expect(
      (
        await db.query<{ state: string }>(
          `select state from public.web_email_deliveries where id=$1`,
          [delivery],
        )
      ).rows[0].state,
    ).toBe("needs_review");
  });
  it("deduplicates webhooks, suppresses bounces and never regresses to delivered", async () => {
    const event = (key: string, type: string) =>
      db.query<{ applied: boolean }>(
        `select public.apply_web_email_event('message@example.test',$1,$2,$3,now(),'recipient@example.test') as applied`,
        [delivery, key, type],
      );
    expect((await event("event-delivered", "delivered")).rows[0].applied).toBe(
      true,
    );
    await event("event-delivered", "delivered");
    expect(
      (await db.query("select * from public.web_email_events")).rows,
    ).toHaveLength(1);
    await event("event-bounce", "hard_bounce");
    await event("event-late", "delivered");
    expect(
      (
        await db.query<{ state: string }>(
          `select state from public.web_email_deliveries where id=$1`,
          [delivery],
        )
      ).rows[0].state,
    ).toBe("bounced");
    expect(
      (await db.query("select * from public.web_email_suppressions")).rows,
    ).toHaveLength(1);
  });
  it("schedules business-local 09:00 and preserves the three-message cap", async () => {
    await actor();
    await db.query("select public.set_web_reminder($1,$2,true)", [
      org,
      invoice,
    ]);
    const clock = await db.query<{ hour: number }>(
      `select extract(hour from next_run_at at time zone 'Australia/Sydney')::integer as hour from public.web_reminder_schedules`,
    );
    expect(clock.rows[0].hour).toBe(9);
    await db.exec("set role service_role");
    await db.query(
      `update public.web_reminder_schedules set runs=2,next_run_at=now()-interval '1 minute'`,
    );
    expect(
      (
        await db.query<{ n: number }>(
          "select public.run_due_web_reminders() as n",
        )
      ).rows[0].n,
    ).toBe(1);
    const schedule = (
      await db.query<{ runs: number; enabled: boolean; opted_in: boolean }>(
        "select runs,enabled,opted_in from public.web_reminder_schedules",
      )
    ).rows[0];
    expect(schedule).toEqual({ runs: 3, enabled: false, opted_in: true });
    expect(
      (
        await db.query<{ n: number }>(
          "select public.run_due_web_reminders() as n",
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("withdraws consent even after the third reminder is queued", async () => {
    await actor();
    await db.query("select public.set_web_reminder($1,$2,false)", [
      org,
      invoice,
    ]);
    await db.exec("set role service_role");
    const schedule = (
      await db.query<{ opted_in: boolean }>(
        "select opted_in from public.web_reminder_schedules",
      )
    ).rows[0];
    expect(schedule.opted_in).toBe(false);
    expect(
      (
        await db.query<{ state: string }>(
          `select state from public.web_email_deliveries where kind='reminder'`,
        )
      ).rows[0].state,
    ).toBe("cancelled");
    await actor();
    await expect(
      db.query("select public.set_web_reminder($1,$2,true)", [org, invoice]),
    ).rejects.toThrow("three-reminder limit");
  });
});
