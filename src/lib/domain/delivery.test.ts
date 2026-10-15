import { describe, it, expect, vi } from "vitest";
import {
  emailConfig,
  prepareEmail,
  submitBrevo,
  DeliveryError,
  type BrevoPayload,
} from "./delivery";
import type { Invoice } from "./types";
const settings = {
  EMAIL_MODE: "test",
  BREVO_API_KEY: "test-placeholder-only",
  SUPABASE_SERVICE_ROLE_KEY: "test-placeholder-only",
  CRON_SECRET: "test-placeholder-only",
  EMAIL_WEBHOOK_SECRET: "test-placeholder-only",
  EMAIL_FROM: "sender@example.test",
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
describe("Brevo delivery boundary", () => {
  it("defaults to disabled and requires a test recipient allowlist", () => {
    expect(emailConfig({})).toBeNull();
    expect(emailConfig({ ...settings, EMAIL_TEST_RECIPIENTS: "" })).toBeNull();
    expect(emailConfig(settings)?.mode).toBe("test");
  });
  it("escapes business content, attaches PDF and uses a stable key", () => {
    const p = prepareEmail(
      invoice,
      "invoice",
      "request-id",
      "JVBERi0=",
      emailConfig(settings)!,
    );
    expect(p.htmlContent).not.toContain("<script>");
    expect(p.htmlContent).toContain("&lt;business&gt;");
    expect(p.attachment[0].content).toBe("JVBERi0=");
    expect(p.headers["Idempotency-Key"]).toBe("request-id");
    expect(p.subject).toContain("INV-000001");
  });
  it("blocks recipients outside the test allowlist", () =>
    expect(() =>
      prepareEmail(
        { ...invoice, contact_snapshot: { email: "other@example.test" } },
        "invoice",
        "id",
        "pdf",
        emailConfig(settings)!,
      ),
    ).toThrow("allowlist"));
  it("distinguishes provider acceptance from final delivery", async () => {
    const fake = vi.fn(
      async () =>
        new Response(JSON.stringify({ messageId: "<message@test>" }), {
          status: 201,
        }),
    );
    expect(
      await submitBrevo({} as BrevoPayload, "test-only", fake as typeof fetch),
    ).toBe("message@test");
    expect(fake).toHaveBeenCalledTimes(1);
  });
  it("does not blindly retry an ambiguous timeout or 5xx", async () => {
    const timeout = vi.fn(async () => {
      throw new Error("timeout");
    });
    await expect(
      submitBrevo({} as BrevoPayload, "test-only", timeout as typeof fetch),
    ).rejects.toMatchObject({ outcome: "needs_review" });
    const failed = vi.fn(async () => new Response("", { status: 503 }));
    await expect(
      submitBrevo({} as BrevoPayload, "test-only", failed as typeof fetch),
    ).rejects.toMatchObject({ outcome: "needs_review" });
    expect(timeout).toHaveBeenCalledTimes(1);
  });
  it("only retries an explicit rate-limit rejection", async () => {
    await expect(
      submitBrevo(
        {} as BrevoPayload,
        "test-only",
        vi.fn(async () => new Response("", { status: 429 })) as typeof fetch,
      ),
    ).rejects.toMatchObject({ outcome: "retry" });
    await expect(
      submitBrevo(
        {} as BrevoPayload,
        "test-only",
        vi.fn(async () => new Response("", { status: 400 })) as typeof fetch,
      ),
    ).rejects.toMatchObject({ outcome: "failed" });
  });
});
