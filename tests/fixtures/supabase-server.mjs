// Isolated browser-test double. This server is never imported by the application.
// It cannot contact the hosted Supabase project, send mail or charge a provider.
import { createServer } from "node:http";
import { createHash, createHmac, randomUUID } from "node:crypto";
const ORG = "20000000-0000-4000-8000-000000000001",
  USER = "10000000-0000-4000-8000-000000000001";
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const organization = {
  id: ORG,
  name: "Isolated test studio",
  abn: null,
  address: "Test address",
  timezone: "Australia/Sydney",
  currency: "AUD",
  gst_registered: true,
  reporting_basis: "accrual",
  active: true,
};
const user = {
  id: USER,
  aud: "authenticated",
  role: "authenticated",
  email: "pilot@example.test",
  email_confirmed_at: now(),
  created_at: now(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { display_name: "Pilot tester" },
  factors: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      factor_type: "totp",
      status: "verified",
      friendly_name: "Test authenticator",
      created_at: now(),
      updated_at: now(),
    },
  ],
};
const verifiedFactors = user.factors;
function jwt(level = assurance) {
  const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url"),
    payload = Buffer.from(
      JSON.stringify({
        sub: USER,
        aud: "authenticated",
        role: "authenticated",
        aal: level,
        email: user.email,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    signature = createHmac("sha256", "isolated-fixture-secret")
      .update(`${header}.${payload}`)
      .digest("base64url");
  return `${header}.${payload}.${signature}`;
}
function session(level = assurance) {
  return {
    access_token: jwt(level),
    refresh_token: "isolated-test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
}
let store,
  role = "owner",
  failReports = false,
  assurance = "aal2",
  recovery,
  passwordUpdates = 0,
  passwordUpdateAttempts = 0,
  challenges = new Set();
function reset() {
  role = "owner";
  failReports = false;
  assurance = "aal2";
  user.factors = verifiedFactors;
  recovery = null;
  passwordUpdates = 0;
  passwordUpdateAttempts = 0;
  challenges = new Set();
  store = {
    contacts: [],
    web_record_reviews: [],
    invoices: [],
    invoice_items: [],
    invoice_payments: [],
    expenses: [],
    receipts: [],
    notification_jobs: [],
    record_events: [],
    audit_events: [],
    support_tickets: [],
    support_messages: [],
    organization_invitations: [],
    saved_report_notes: [],
    web_billing_profiles: [],
    profiles: [
      {
        id: USER,
        display_name: "Pilot tester",
        notification_preferences: { reminders: false },
      },
    ],
    expense_categories: [
      {
        id: "40000000-0000-4000-8000-000000000001",
        organization_id: ORG,
        name: "Uncategorised",
      },
    ],
  };
}
reset();
function balances() {
  return store.invoices.map((i) => {
    const paid = store.invoice_payments
        .filter((p) => p.invoice_id === i.id)
        .reduce((a, p) => a + p.amount_cents, 0),
      customer = store.contacts.find((c) => c.id === i.contact_id);
    return {
      ...i,
      paid_cents: paid,
      outstanding_cents: i.total_cents - paid,
      customer_name: i.contact_snapshot?.name ?? customer?.name ?? "",
      derived_status:
        i.state === "draft"
          ? "Draft"
          : i.state === "void"
            ? "Void"
            : paid >= i.total_cents
              ? "Paid"
              : i.due_date < today()
                ? "Overdue"
                : paid
                  ? "Partial"
                  : "Issued",
    };
  });
}
function report() {
  const invoices = balances(),
    payments = store.invoice_payments.reduce((a, p) => a + p.amount_cents, 0),
    expenses = store.expenses.reduce((a, e) => a + e.total_cents, 0),
    paid = store.expenses
      .filter((e) => e.payment_status === "paid")
      .reduce((a, e) => a + e.total_cents, 0);
  return {
    has_activity: !!(invoices.length || store.expenses.length),
    invoiced_cents: invoices
      .filter((i) => i.state === "issued")
      .reduce((a, i) => a + i.total_cents, 0),
    payments_cents: payments,
    expenses_cents: expenses,
    paid_expenses_cents: paid,
    outstanding_cents: invoices
      .filter((i) => i.state === "issued")
      .reduce((a, i) => a + i.outstanding_cents, 0),
    overdue_cents: 0,
    overdue_count: 0,
    gst_sales_cents: invoices.reduce((a, i) => a + i.tax_cents, 0),
    gst_expenses_cents: store.expenses.reduce((a, e) => a + e.tax_cents, 0),
    previous_payments_cents: 0,
    previous_paid_expenses_cents: 0,
    trend: [{ date: today(), in: payments, out: paid }],
    categories: store.expenses.length
      ? [{ name: "Uncategorised", total_cents: expenses }]
      : [],
    upcoming: invoices.filter(
      (i) => i.state === "issued" && i.outstanding_cents > 0,
    ),
    recent_expenses: store.expenses.slice(-5),
  };
}
function rowsFor(table) {
  if (table === "organizations") return [organization];
  if (table === "organization_members")
    return [
      {
        organization_id: ORG,
        user_id: USER,
        role,
        active: true,
        organizations: organization,
      },
    ];
  if (table === "invoice_balances") return balances();
  return store[table] ?? [];
}
function matches(row, url) {
  for (const [key, value] of url.searchParams) {
    if (["select", "order", "limit", "offset", "or"].includes(key)) continue;
    const [op, ...parts] = value.split("."),
      expected = parts.join(".");
    if (op === "eq" && String(row[key]) !== expected) return false;
    if (
      op === "ilike" &&
      !String(row[key] ?? "")
        .toLowerCase()
        .includes(expected.replaceAll("%", "").toLowerCase())
    )
      return false;
  }
  if (url.searchParams.has("or")) {
    const query = url.searchParams.get("or");
    const terms = [...query.matchAll(/([\w_]+)\.ilike\.%([^%]*)%/g)];
    if (
      terms.length &&
      !terms.some(([, key, value]) =>
        String(row[key] ?? "")
          .toLowerCase()
          .includes(value.toLowerCase()),
      )
    )
      return false;
  }
  return true;
}
async function requestBody(req) {
  let raw = "";
  for await (const data of req) raw += data;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3100");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
  );
  res.setHeader("Access-Control-Expose-Headers", "Content-Range");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  const url = new URL(req.url, "http://127.0.0.1:54329"),
    path = url.pathname;
  let payload = null,
    status = 200;
  function send(value, code = 200) {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(req.method === "HEAD" ? "" : JSON.stringify(value));
  }
  try {
    if (path === "/health") return send({ isolated: true });
    if (path === "/__test/reset") {
      reset();
      return send({ reset: true });
    }
    if (path === "/__test/fail") {
      failReports = (await requestBody(req)).enabled;
      return send({ failReports });
    }
    if (path === "/__test/role") {
      role = (await requestBody(req)).role;
      return send({ role });
    }
    if (path === "/__test/auth") {
      if (req.method === "POST") {
        const config = await requestBody(req);
        assurance = config.assurance ?? assurance;
        user.factors = config.mfaEnabled === false ? [] : verifiedFactors;
      }
      return send({ passwordUpdates, passwordUpdateAttempts });
    }
    if (path === "/__test/recovery") {
      const callback = new URL(recovery.redirectTo);
      callback.searchParams.set("code", "isolated-recovery-code");
      return send({ callback: callback.toString() });
    }
    if (path === "/auth/v1/token") {
      const b = await requestBody(req);
      if (url.searchParams.get("grant_type") === "pkce") {
        const challenge = createHash("sha256")
          .update(b.code_verifier ?? "")
          .digest("base64url");
        if (
          !recovery ||
          b.auth_code !== "isolated-recovery-code" ||
          challenge !== recovery.codeChallenge
        )
          return send(
            { msg: "Invalid recovery code", error_code: "bad_code_verifier" },
            400,
          );
        recovery = null;
      }
      if (b.password === "wrong")
        return send(
          {
            msg: "Invalid login credentials",
            error_code: "invalid_credentials",
          },
          400,
        );
      return send(session());
    }
    if (path === "/auth/v1/user") {
      if (req.method === "PUT") {
        passwordUpdateAttempts += 1;
        const claims = JSON.parse(
          Buffer.from(
            req.headers.authorization.split(".")[1],
            "base64url",
          ).toString(),
        );
        if (user.factors.length && claims.aal !== "aal2")
          return send(
            {
              msg: "AAL2 session is required to update email or password when MFA is enabled.",
              error_code: "insufficient_aal",
            },
            401,
          );
        passwordUpdates += 1;
      }
      return send(user);
    }
    if (path === "/auth/v1/recover") {
      const body = await requestBody(req);
      recovery = {
        codeChallenge: body.code_challenge,
        redirectTo: url.searchParams.get("redirect_to"),
      };
      return send({});
    }
    if (path === "/auth/v1/logout" || path === "/auth/v1/resend")
      return send({});
    if (path.includes("/challenge")) {
      const id = randomUUID();
      challenges.add(id);
      return send({
        id,
        expires_at: Math.floor(Date.now() / 1000) + 120,
      });
    }
    if (path.includes("/verify")) {
      const body = await requestBody(req);
      if (body.code !== "123456" || !challenges.delete(body.challenge_id))
        return send(
          {
            msg: "Invalid authenticator code",
            error_code: "mfa_verification_failed",
          },
          422,
        );
      return send(session("aal2"));
    }
    if (path.startsWith("/storage/v1/object/sign/receipts/")) {
      if (req.method === "POST")
        return send({
          signedURL:
            "/object/sign/receipts/" +
            path.split("/receipts/")[1] +
            "?token=isolated-preview",
        });
      const buffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB7sAAAAASUVORK5CYII=",
        "base64",
      );
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(buffer);
      return;
    }
    if (path.startsWith("/storage/v1/object/receipts/")) {
      for await (const chunk of req) {
      }
      return send({
        Key: "receipts/" + path.split("/receipts/")[1],
        Id: randomUUID(),
      });
    }
    if (path.startsWith("/functions/v1/ai-assist"))
      return send({ error: "AI unavailable in this isolated test." }, 503);
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.split("/").at(-1),
        b = await requestBody(req);
      if (b.org && b.org !== ORG)
        return send({ message: "Permission denied", code: "42501" }, 403);
      if (fn === "web_advanced_report")
        return send({
          ageing: {
            current: report().outstanding_cents,
            days_1_30: 0,
            days_31_60: 0,
            days_61_90: 0,
            days_90_plus: 0,
          },
          suppliers: [],
          unassigned_expenses_cents: report().expenses_cents,
        });
      if (fn === "request_web_review") {
        const row = (
          b.kind === "invoice" ? store.invoices : store.expenses
        ).find((r) => r.id === b.record);
        if (!row) return send({ message: "Record unavailable" }, 404);
        const review = {
          id: randomUUID(),
          organization_id: ORG,
          record_kind: b.kind,
          record_id: b.record,
          status: "requested",
          requested_by: USER,
          note: "",
          created_at: now(),
          snapshot: {
            ...row,
            lines: store.invoice_items.filter((l) => l.invoice_id === row.id),
          },
        };
        store.web_record_reviews.push(review);
        return send(review.id);
      }
      if (fn === "report_summary")
        return failReports
          ? send({ message: "Isolated report outage" }, 503)
          : send(report());
      if (fn === "is_platform_admin") return send(false);
      if (fn === "entitlements")
        return send({
          configured: false,
          features: {
            invoices: true,
            expenses: true,
            reports: true,
            csv: true,
            ai: true,
          },
        });
      if (
        role === "viewer" &&
        !["report_summary", "is_platform_admin", "entitlements"].includes(fn)
      )
        return send({ message: "Permission denied", code: "42501" }, 403);
      if (fn === "save_invoice") {
        const old = store.invoices.find((i) => i.id === b.invoice_id);
        if (old && old.state !== "draft")
          return send({ message: "Only drafts can be edited" }, 400);
        let subtotal = 0,
          tax = 0,
          total = 0;
        store.invoice_items = store.invoice_items.filter(
          (l) => l.invoice_id !== b.invoice_id,
        );
        b.line_items.forEach((l, index) => {
          const amount = Math.round(Number(l.quantity) * l.unit_cents),
            gst =
              l.tax_mode === "exclusive"
                ? Math.round(amount / 10)
                : l.tax_mode === "inclusive"
                  ? Math.round(amount / 11)
                  : 0,
            base = l.tax_mode === "inclusive" ? amount - gst : amount,
            gross = l.tax_mode === "exclusive" ? amount + gst : amount;
          subtotal += base;
          tax += gst;
          total += gross;
          store.invoice_items.push({
            ...l,
            id: randomUUID(),
            organization_id: ORG,
            invoice_id: b.invoice_id,
            subtotal_cents: base,
            tax_cents: gst,
            total_cents: gross,
            position: index,
          });
        });
        const invoice = {
          id: b.invoice_id,
          organization_id: ORG,
          contact_id: b.customer_id,
          number: null,
          issue_date: b.issued,
          due_date: b.due,
          state: "draft",
          currency: "AUD",
          notes: b.invoice_notes,
          subtotal_cents: subtotal,
          tax_cents: tax,
          total_cents: total,
          calculation_version: 1,
          created_at: old?.created_at ?? now(),
          organization_snapshot: null,
          contact_snapshot: null,
        };
        store.invoices = store.invoices.filter((i) => i.id !== invoice.id);
        store.invoices.push(invoice);
        store.record_events.push({
          id: randomUUID(),
          organization_id: ORG,
          invoice_id: invoice.id,
          action: "insert",
          created_at: now(),
        });
        return send(invoice.id);
      }
      if (fn === "issue_invoice" || fn === "issue_web_invoice") {
        const invoice = store.invoices.find((i) => i.id === b.target_invoice);
        if (!invoice) return send({ message: "Invoice unavailable" }, 404);
        Object.assign(invoice, {
          state: "issued",
          number: "INV-000001",
          organization_snapshot: { ...organization },
          contact_snapshot: {
            ...store.contacts.find((c) => c.id === invoice.contact_id),
          },
        });
        return send(invoice);
      }
      if (fn === "record_payment") {
        const invoice = balances().find((i) => i.id === b.target_invoice);
        if (!invoice || b.cents > invoice.outstanding_cents)
          return send({ message: "Check payment amount" }, 400);
        const existing = store.invoice_payments.find(
          (p) => p.request_id === b.idempotency_key,
        );
        if (existing) return send(existing.id);
        const payment = {
          id: randomUUID(),
          organization_id: ORG,
          invoice_id: b.target_invoice,
          amount_cents: b.cents,
          payment_date: b.paid_on,
          reference: b.payment_reference,
          request_id: b.idempotency_key,
        };
        store.invoice_payments.push(payment);
        return send(payment.id);
      }
      if (fn === "void_invoice") {
        const invoice = store.invoices.find((i) => i.id === b.target_invoice);
        invoice.state = "void";
        return send(null);
      }
      if (fn === "save_expense") {
        let expense = store.expenses.find(
          (e) =>
            e.id === b.expense_id ||
            (b.dedupe_key && e.import_key === b.dedupe_key),
        );
        if (!expense) {
          expense = {
            id: randomUUID(),
            organization_id: ORG,
            archived: false,
            created_at: now(),
            import_key: b.dedupe_key,
          };
          store.expenses.push(expense);
        }
        const gst =
          b.mode === "exclusive"
            ? Math.round(b.amount / 10)
            : b.mode === "inclusive"
              ? Math.round(b.amount / 11)
              : 0;
        Object.assign(expense, {
          description: b.expense_description,
          transaction_date: b.transacted,
          paid_date: b.paid_on,
          payment_status: b.payment_state,
          category_id: b.category,
          supplier_id: b.supplier,
          entered_cents: b.amount,
          tax_mode: b.mode,
          subtotal_cents: b.mode === "inclusive" ? b.amount - gst : b.amount,
          tax_cents: gst,
          total_cents: b.mode === "exclusive" ? b.amount + gst : b.amount,
          notes: b.expense_notes,
        });
        return send(expense.id);
      }
      if (fn === "register_receipt") {
        if (b.org !== ORG || !b.path.startsWith(ORG + "/"))
          return send({ message: "Permission denied" }, 403);
        store.receipts.push({
          id: b.receipt_id,
          organization_id: ORG,
          expense_id: b.linked_expense,
          object_path: b.path,
          filename: b.original_name,
          mime: b.content_type,
          size_bytes: b.bytes,
          created_at: now(),
        });
        return send(b.receipt_id);
      }
      if (fn === "create_ticket") {
        const t = {
          id: randomUUID(),
          organization_id: ORG,
          subject: b.title,
          status: "open",
          created_at: now(),
        };
        store.support_tickets.push(t);
        store.support_messages.push({
          id: randomUUID(),
          organization_id: ORG,
          ticket_id: t.id,
          body: b.message,
          created_by: USER,
          created_at: now(),
        });
        return send(t.id);
      }
      if (fn === "request_privacy_action") return send(randomUUID());
      return send({ message: `Unimplemented isolated RPC: ${fn}` }, 501);
    }
    if (path.startsWith("/rest/v1/")) {
      const table = path.split("/").at(-1);
      let rows = rowsFor(table).filter((r) => matches(r, url));
      if (req.method === "POST") {
        const b = await requestBody(req);
        if (role === "viewer")
          return send({ message: "Permission denied" }, 403);
        const row = {
          id: b.id ?? randomUUID(),
          created_at: now(),
          archived: false,
          ...b,
        };
        store[table] ??= [];
        store[table].push(row);
        rows = [row];
      }
      if (req.method === "PATCH") {
        const b = await requestBody(req);
        rows.forEach((r) => Object.assign(r, b));
      }
      const total = rows.length;
      const offset = Number(url.searchParams.get("offset") ?? 0),
        limit = Number(url.searchParams.get("limit") ?? 1000);
      rows = rows.slice(offset, offset + limit);
      res.setHeader(
        "Content-Range",
        `${offset}-${Math.max(offset, offset + rows.length - 1)}/${total}`,
      );
      if (req.headers.accept?.includes("application/vnd.pgrst.object+json"))
        return rows.length === 1
          ? send(rows[0])
          : send(
              {
                message: "Record not found",
                code: "PGRST116",
                details: "The result contains 0 rows",
              },
              406,
            );
      return send(rows);
    }
    send({ message: "Not found in isolated test server" }, 404);
  } catch (error) {
    send({ message: error.message }, 500);
  }
});
server.listen(54329, "127.0.0.1", () =>
  process.stdout.write("Isolated Supabase browser fixture on 54329\n"),
);
