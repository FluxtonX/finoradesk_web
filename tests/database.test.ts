import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
let db: PGlite;
const owner = "10000000-0000-4000-8000-000000000001",
  viewer = "10000000-0000-4000-8000-000000000002";
let org: string;
async function claims(user: string, aal = "aal2") {
  await db.query(
    `select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,
    [user, JSON.stringify({ sub: user, aal })],
  );
}
async function role(name: string) {
  await db.exec(`set role ${name}`);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth to authenticated,service_role;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  grant execute on function auth.uid(),auth.jwt() to authenticated,service_role;
  insert into auth.users(id,email,email_confirmed_at) values('${owner}','owner@example.test',now()),('${viewer}','viewer@example.test',now());`);
  await db.exec(
    await readFile(
      "../supabase/migrations/202610140001_foundation.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "../supabase/migrations/202610150012_web_billing.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "../supabase/migrations/202610140006_administration.sql",
      "utf8",
    ),
  );
  await db.exec(
    "create table public.invoices(organization_id uuid,issued_at timestamptz);create table public.import_jobs(created_at timestamptz default now(),errors integer default 0);create table public.web_email_deliveries(state text)",
  );
  await db.exec(
    await readFile(
      "../supabase/migrations/202610150014_web_operations.sql",
      "utf8",
    ),
  );
  await claims(owner);
  const result = await db.query<{ id: string }>(
    `select public.create_organization('Isolated SQL test') as id`,
  );
  org = result.rows[0].id;
  await db.query(
    `insert into public.organization_members values($1,$2,'viewer',true)`,
    [org, viewer],
  );
  await db.query(
    `insert into public.web_billing_profiles(organization_id,stripe_customer_id) values($1,'cus_isolated')`,
    [org],
  );
});
afterAll(async () => {
  await db?.close();
});
describe("web billing migration on isolated PostgreSQL", () => {
  it("resumes one checkout across duplicate browser requests", async () => {
    await role("service_role");
    const first = "70000000-0000-4000-8000-000000000001",
      second = "70000000-0000-4000-8000-000000000002";
    const claim = (key: string, plan = "growth") =>
      db.query<{ id: string }>(
        "select public.claim_web_checkout($1,$2,$3) as id",
        [org, key, plan],
      );
    expect((await claim(first)).rows[0].id).toBe(first);
    expect((await claim(second)).rows[0].id).toBe(first);
    await expect(claim(second, "business")).rejects.toThrow("already open");
  });

  async function apply(
    event: string,
    at: string,
    status = "active",
    customer = "cus_isolated",
    plan = "growth",
  ) {
    return db.query<{ applied: boolean }>(
      `select public.apply_web_subscription_event($1,$2,'sub_isolated',$3,$4,now()+interval '1 month',false,$5,'customer.subscription.updated',$6) as applied`,
      [org, customer, plan, status, event, at],
    );
  }
  it("applies provider-owned state and deduplicates repeated events", async () => {
    await role("service_role");
    expect((await apply("evt_a", "2026-10-15T10:00:00Z")).rows[0].applied).toBe(
      true,
    );
    expect((await apply("evt_a", "2026-10-15T10:00:00Z")).rows[0].applied).toBe(
      false,
    );
  });
  it("does not regress state on an older event", async () => {
    expect(
      (await apply("evt_old", "2026-10-14T10:00:00Z", "past_due")).rows[0]
        .applied,
    ).toBe(false);
    const r = await db.query<{ status: string }>(
      "select status from public.web_billing_profiles",
    );
    expect(r.rows[0].status).toBe("active");
  });
  it("rejects customer and plan mismatches", async () => {
    await expect(
      apply("evt_wrong", "2026-10-15T11:00:00Z", "active", "cus_wrong"),
    ).rejects.toThrow("does not belong");
    await expect(
      apply(
        "evt_plan",
        "2026-10-15T11:00:00Z",
        "active",
        "cus_isolated",
        "invented",
      ),
    ).rejects.toThrow("Unsupported");
  });
  it("prevents authenticated users from forging subscription state", async () => {
    await role("authenticated");
    await claims(owner);
    await expect(apply("evt_forged", "2026-10-15T12:00:00Z")).rejects.toThrow(
      "permission denied",
    );
    await expect(
      db.query(`update public.web_billing_profiles set status='active'`),
    ).rejects.toThrow("permission denied");
  });
  it("hides billing metadata from viewer roles", async () => {
    await claims(viewer);
    expect(
      (await db.query("select * from public.web_billing_profiles")).rows,
    ).toHaveLength(0);
  });
  it("requires MFA and available plan seats for web invitations", async () => {
    await claims(owner, "aal1");
    await expect(
      db.query(
        `select public.web_invite_member($1,'invited@example.test','member')`,
        [org],
      ),
    ).rejects.toThrow("MFA required");
    await claims(owner);
    await role("service_role");
    await db.query(
      `update public.web_billing_profiles set plan_id='starter' where organization_id=$1`,
      [org],
    );
    await role("authenticated");
    await expect(
      db.query(
        `select public.web_invite_member($1,'invited@example.test','member')`,
        [org],
      ),
    ).rejects.toThrow("no available seats");
  });
});

describe("operating metrics access", () => {
  it("returns safe subscription access to members and preserves read-only cancellation", async () => {
    await role("authenticated");
    await claims(owner);
    expect(
      (
        await db.query<{ access: { can_write: boolean } }>(
          "select public.web_access($1) as access",
          [org],
        )
      ).rows[0].access.can_write,
    ).toBe(true);
    await claims(viewer);
    expect(
      (
        await db.query<{ access: { can_write: boolean } }>(
          "select public.web_access($1) as access",
          [org],
        )
      ).rows[0].access.can_write,
    ).toBe(false);
    await role("service_role");
    await db.query(
      "update public.web_billing_profiles set status='canceled' where organization_id=$1",
      [org],
    );
    await role("authenticated");
    await claims(owner);
    expect(
      (
        await db.query<{ access: { can_write: boolean } }>(
          "select public.web_access($1) as access",
          [org],
        )
      ).rows[0].access.can_write,
    ).toBe(false);
  });
  it("requires an explicit staff assignment and MFA", async () => {
    await role("authenticated");
    await claims(owner);
    await expect(
      db.query("select public.web_operating_overview()"),
    ).rejects.toThrow("platform staff");
    await db.exec("reset role");
    await db.query("insert into private.platform_admins values($1)", [owner]);
    await role("authenticated");
    await claims(owner, "aal1");
    await expect(
      db.query("select public.web_operating_overview()"),
    ).rejects.toThrow("platform staff");
    await claims(owner);
    const result = await db.query<{
      metrics: {
        signups: number;
        eligible_businesses: number;
        activated_businesses: number;
      };
    }>("select public.web_operating_overview() as metrics");
    expect(result.rows[0].metrics.signups).toBe(2);
    expect(result.rows[0].metrics.eligible_businesses).toBe(0);
    expect(result.rows[0].metrics.activated_businesses).toBe(0);
  });
});
