import { describe, it, expect, vi } from "vitest";
import {
  emailConfig,
  prepareEmail,
  submitResend,
  type ResendPayload,
} from "./delivery";
import type { Invoice } from "./types";
const settings = {
  EMAIL_MODE: "test",
  RESEND_API_KEY: "test-placeholder-only",
  SUPABASE_SERVICE_ROLE_KEY: "test-placeholder-only",
  CRON_SECRET: "test-placeholder-only",
  RESEND_WEBHOOK_SECRET: "test-placeholder-only",
  EMAIL_FROM: "onboarding@resend.dev",
  EMAIL_TEST_RECIPIENTS: "recipient@example.test",
};
const invoice = {
  number: "INV-000001",
  organization_snapshot: { name: "Test <business>" },
  contact_snapshot: {
    name: "Person <script>",
    email: "recipient@example.test",
  },
  due_date: "2026-10-20",
  notes: "Pay <b>only</b> after review.",
  total_cents: 11000,
  outstanding_cents: 7000,
} as Invoice;
const payload = () =>
  prepareEmail(
    invoice,
    "invoice",
    "request-id",
    "JVBERi0=",
    emailConfig(settings)!,
  );
describe("Resend delivery boundary", () => {
  it("defaults to disabled; requires all server settings and controlled recipients", () => {
    expect(emailConfig({})).toBeNull();
    expect(emailConfig({ ...settings, EMAIL_TEST_RECIPIENTS: "" })).toBeNull();
    expect(emailConfig({ ...settings, RESEND_WEBHOOK_SECRET: "" })).toBeNull();
    expect(emailConfig({ ...settings, EMAIL_REPLY_TO: "invalid" })).toBeNull();
    expect(emailConfig(settings)?.mode).toBe("test");
  });
  it("refuses the development sender in live mode", () => {
    expect(emailConfig({ ...settings, EMAIL_MODE: "live" })).toBeNull();
    expect(
      emailConfig({
        ...settings,
        EMAIL_MODE: "live",
        EMAIL_FROM: "invoices@example.test",
      })?.mode,
    ).toBe("live");
  });
  it("escapes content, attaches the issued PDF and correlates callbacks", () => {
    const p = payload();
    expect(p.html).not.toContain("<script>");
    expect(p.html).toContain("&lt;business&gt;");
    expect(p.attachments[0]).toEqual({
      filename: "INV-000001.pdf",
      content: "JVBERi0=",
    });
    expect(p.tags).toContainEqual({ name: "delivery_id", value: "request-id" });
    expect(p.subject).toContain("INV-000001");
    expect(p.from).toBe("Finoredesk <onboarding@resend.dev>");
  });
  it("blocks recipients outside the test allowlist without rewriting them", () => {
    expect(() =>
      prepareEmail(
        { ...invoice, contact_snapshot: { email: "other@example.test" } },
        "invoice",
        "id",
        "pdf",
        emailConfig(settings)!,
      ),
    ).toThrow("allowlist");
  });
  it("uses outstanding balance in reminders and removes subject header injection", () => {
    const p = prepareEmail(
      { ...invoice, number: "INV\r\nBcc: injected" },
      "reminder",
      "id",
      "pdf",
      emailConfig(settings)!,
    );
    expect(p.subject).not.toMatch(/[\r\n]/);
    expect(p.text).toContain("70.00");
    expect(p.text).not.toContain("110.00");
  });
  it("sends idempotency as an HTTP header and parses accepted provider ID", async () => {
    const id = "10000000-0000-4000-8000-000000000001";
    const fake = vi.fn(
      async () => new Response(JSON.stringify({ id }), { status: 200 }),
    );
    expect(
      await submitResend(
        payload(),
        "test-only",
        "job-id",
        fake as typeof fetch,
      ),
    ).toBe(id);
    const [url, request] = fake.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(request.headers).toMatchObject({
      authorization: "Bearer test-only",
      "Idempotency-Key": "finoredesk/job-id",
    });
    expect(JSON.parse(request.body as string)).toEqual(payload());
  });
  it.each([503, 409, 408])(
    "quarantines ambiguous HTTP %s instead of resending",
    async (status) => {
      await expect(
        submitResend(
          {} as ResendPayload,
          "test-only",
          "id",
          vi.fn(async () => new Response("", { status })) as typeof fetch,
        ),
      ).rejects.toMatchObject({ outcome: "needs_review" });
    },
  );
  it("quarantines a timeout or incomplete acceptance response", async () => {
    await expect(
      submitResend(
        payload(),
        "test-only",
        "id",
        vi.fn(async () => {
          throw new Error("timeout");
        }) as typeof fetch,
      ),
    ).rejects.toMatchObject({ outcome: "needs_review" });
    await expect(
      submitResend(
        payload(),
        "test-only",
        "id",
        vi.fn(async () => new Response("{}")) as typeof fetch,
      ),
    ).rejects.toMatchObject({ outcome: "needs_review" });
  });
  it("only retries an explicit rate limit and hides provider error content", async () => {
    await expect(
      submitResend(
        payload(),
        "test-only",
        "id",
        vi.fn(async () => new Response("", { status: 429 })) as typeof fetch,
      ),
    ).rejects.toMatchObject({ outcome: "retry" });
    await expect(
      submitResend(
        payload(),
        "test-only",
        "id",
        vi.fn(
          async () => new Response("sensitive-provider-data", { status: 403 }),
        ) as typeof fetch,
      ),
    ).rejects.toMatchObject({ outcome: "failed" });
  });
});
