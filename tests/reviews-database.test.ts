import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
let db: PGlite, org: string, customer: string, invoice: string, review: string;
const owner = "10000000-0000-4000-8000-000000000021",
  admin = "10000000-0000-4000-8000-000000000022",
  member = "10000000-0000-4000-8000-000000000023";
async function actor(id = owner, aal = "aal2") {
  await db.exec("set role authenticated");
  await db.query(
    `select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,
    [id, JSON.stringify({ sub: id, aal })],
  );
}
async function draft(id: string | null = null, unit = 10000) {
  return (
    await db.query<{ id: string }>(
      `select public.save_invoice($1,$2,$3,current_date,current_date+14,$4) as id`,
      [
        org,
        id,
        customer,
        JSON.stringify([
          {
            description: "Reviewed service",
            quantity: "1",
            unit_cents: unit,
            tax_mode: "exclusive",
          },
        ]),
      ],
    )
  ).rows[0].id;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    insert into auth.users values('${owner}','owner@example.test',now()),('${admin}','admin@example.test',now()),('${member}','member@example.test',now());`);
  for (const migration of [
    "202610140001_foundation.sql",
    "202610140002_invoicing.sql",
    "202610140009_idempotent_drafts.sql",
    "202610150012_web_billing.sql",
  ])
    await db.exec(
      await readFile(`../supabase/migrations/${migration}`, "utf8"),
    );
  // Minimal read-side expense fixture; expense mutation rules are unchanged.
  await db.exec(
    `create table public.expenses(id uuid primary key default gen_random_uuid(),organization_id uuid references public.organizations(id),description text,total_cents bigint,payment_status text,transaction_date date,supplier_id uuid,archived boolean default false)`,
  );
  await db.exec(
    await readFile(
      "../supabase/migrations/202610150015_web_reviews_reports.sql",
      "utf8",
    ),
  );
  await actor();
  org = (
    await db.query<{ id: string }>(
      `select public.create_organization('Review test',null,true) as id`,
    )
  ).rows[0].id;
  customer = (
    await db.query<{ id: string }>(
      `insert into public.contacts(organization_id,type,name,email) values($1,'customer','Customer','customer@example.test') returning id`,
      [org],
    )
  ).rows[0].id;
  await db.exec("reset role");
  await db.query(
    `insert into public.organization_members values($1,$2,'admin',true),($1,$3,'member',true)`,
    [org, admin, member],
  );
  await actor();
  invoice = await draft();
});
afterAll(async () => {
  await db?.close();
});
describe("review workflows and expanded management reports", () => {
  it("deduplicates the same saved review and rejects wrong-tenant records", async () => {
    const request = () =>
      db.query<{ id: string }>(
        `select public.request_web_review($1,'invoice',$2) as id`,
        [org, invoice],
      );
    review = (await request()).rows[0].id;
    expect((await request()).rows[0].id).toBe(review);
    await expect(
      db.query(`select public.request_web_review($1,'invoice',$2)`, [
        randomUUID(),
        invoice,
      ]),
    ).rejects.toThrow("Permission denied");
  });
  it("requires a different admin and MFA for review decisions", async () => {
    await expect(
      db.query(`select public.decide_web_review($1,$2,'approved')`, [
        org,
        review,
      ]),
    ).rejects.toThrow("different business admin");
    await actor(admin, "aal1");
    await expect(
      db.query(`select public.decide_web_review($1,$2,'approved')`, [
        org,
        review,
      ]),
    ).rejects.toThrow("MFA");
    await actor(member);
    await expect(
      db.query(`select public.decide_web_review($1,$2,'approved')`, [
        org,
        review,
      ]),
    ).rejects.toThrow("Permission denied");
    await actor();
  });
  it("enforces the opt-in policy even through the existing issue RPC", async () => {
    await db.query("select public.set_web_approval_policy($1,true)", [org]);
    await expect(
      db.query("select public.issue_invoice($1,$2)", [org, invoice]),
    ).rejects.toThrow("Request approval");
  });
  it("issues an approved version and preserves idempotent retry", async () => {
    await actor(admin);
    await db.query(
      `select public.decide_web_review($1,$2,'approved','Checked')`,
      [org, review],
    );
    await actor();
    const issued = await db.query<{ state: string }>(
      `select (public.issue_web_invoice($1,$2)).state as state`,
      [org, invoice],
    );
    expect(issued.rows[0].state).toBe("issued");
    expect(
      (
        await db.query<{ state: string }>(
          `select (public.issue_web_invoice($1,$2)).state as state`,
          [org, invoice],
        )
      ).rows[0].state,
    ).toBe("issued");
  });
  it("invalidates approval when the saved draft changes", async () => {
    const id = await draft();
    const requested = (
      await db.query<{ id: string }>(
        `select public.request_web_review($1,'invoice',$2) as id`,
        [org, id],
      )
    ).rows[0].id;
    await actor(admin);
    await db.query(`select public.decide_web_review($1,$2,'approved')`, [
      org,
      requested,
    ]);
    await actor();
    await draft(id, 20000);
    await expect(
      db.query("select public.issue_invoice($1,$2)", [org, id]),
    ).rejects.toThrow("Request approval");
    const fresh = (
      await db.query<{ id: string }>(
        `select public.request_web_review($1,'invoice',$2) as id`,
        [org, id],
      )
    ).rows[0].id;
    expect(fresh).not.toBe(requested);
  });
  it("reconciles ageing after payment and excludes unknown expenses from paid totals", async () => {
    await db.query(
      `select public.record_payment($1,$2,4000,current_date,'Partial',$3)`,
      [org, invoice, randomUUID()],
    );
    const supplier = (
      await db.query<{ id: string }>(
        `insert into public.contacts(organization_id,type,name) values($1,'supplier','Supplier') returning id`,
        [org],
      )
    ).rows[0].id;
    await db.exec("reset role");
    await db.query(
      `insert into public.expenses(organization_id,description,total_cents,payment_status,transaction_date,supplier_id) values($1,'Unknown payment',2000,'unknown',current_date,$2)`,
      [org, supplier],
    );
    await actor();
    const result = (
      await db.query<{
        report: {
          ageing: { current: number };
          suppliers: {
            paid_cents: number;
            unpaid_cents: number;
            total_cents: number;
          }[];
        };
      }>(
        `select public.web_advanced_report($1,current_date-1,current_date+1) as report`,
        [org],
      )
    ).rows[0].report;
    expect(result.ageing.current).toBe(7000);
    expect(result.suppliers[0]).toMatchObject({
      total_cents: 2000,
      paid_cents: 0,
      unpaid_cents: 0,
    });
  });
  it("guards review and reporting features by actual paid tier", async () => {
    await db.exec("reset role");
    await db.query(
      `insert into public.web_billing_profiles(organization_id,stripe_customer_id,stripe_subscription_id,plan_id,status,current_period_end) values($1,'cus_review','sub_review','starter','active',now()+interval '1 month')`,
      [org],
    );
    await actor();
    await expect(
      db.query(
        `select public.web_advanced_report($1,current_date,current_date)`,
        [org],
      ),
    ).rejects.toThrow("Growth or Business");
    await expect(
      db.query(`select public.request_web_review($1,'invoice',$2)`, [
        org,
        invoice,
      ]),
    ).rejects.toThrow("Business plan");
  });
});
