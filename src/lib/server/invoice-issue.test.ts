import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
import { issueSavedInvoice } from "./invoice-issue";

const missingWrapper = {
  code: "PGRST202",
  message:
    "Could not find the function public.issue_web_invoice(org, target_invoice) in the schema cache",
};
const missingTable = {
  code: "PGRST205",
  message:
    "Could not find the table public.web_business_preferences in the schema cache",
};

function client(
  modernError: unknown,
  policy: { data: unknown; error: unknown } = {
    data: null,
    error: missingTable,
  },
  coreError: unknown = null,
) {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ error: modernError })
    .mockResolvedValueOnce({ error: coreError });
  const maybeSingle = vi.fn().mockResolvedValue(policy);
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle }) }),
  }));
  return { db: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

describe("invoice issuing across hosted schema versions", () => {
  it("uses the approval-aware issuer when available", async () => {
    const { db, rpc, from } = client(null);
    await issueSavedInvoice(db, "org", "invoice");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("issue_web_invoice", {
      org: "org",
      target_invoice: "invoice",
    });
    expect(from).not.toHaveBeenCalled();
  });
  it("issues through the core RPC when the optional review module is absent", async () => {
    const { db, rpc } = client(missingWrapper);
    await issueSavedInvoice(db, "org", "invoice");
    expect(rpc).toHaveBeenNthCalledWith(2, "issue_invoice", {
      org: "org",
      target_invoice: "invoice",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("permits the core path when approvals are explicitly off", async () => {
    const { db, rpc } = client(missingWrapper, {
      data: { invoice_approval_required: false },
      error: null,
    });
    await issueSavedInvoice(db, "org", "invoice");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("keeps the draft when approvals are enabled but the wrapper is missing", async () => {
    const { db, rpc } = client(missingWrapper, {
      data: { invoice_approval_required: true },
      error: null,
    });
    await expect(issueSavedInvoice(db, "org", "invoice")).rejects.toThrow(
      "Invoice approval is enabled",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    {
      code: "P0001",
      message: "Request approval for the current draft before issuing",
    },
    { code: "42501", message: "Permission denied" },
    {
      code: "PGRST202",
      message: "Could not find another_function in the schema cache",
    },
    { code: "503", message: "Connection interrupted" },
  ])(
    "does not retry other errors through the core issuer: $code",
    async (error) => {
      const { db, rpc, from } = client(error);
      await expect(issueSavedInvoice(db, "org", "invoice")).rejects.toThrow(
        error.message,
      );
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(from).not.toHaveBeenCalled();
    },
  );
  it("fails closed when approval policy cannot be read", async () => {
    const { db, rpc } = client(missingWrapper, {
      data: null,
      error: { code: "42501", message: "Permission denied" },
    });
    await expect(issueSavedInvoice(db, "org", "invoice")).rejects.toThrow(
      "Permission denied",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("retains the database trigger's decision if policy changes during issuance", async () => {
    const { db, rpc } = client(
      missingWrapper,
      { data: { invoice_approval_required: false }, error: null },
      {
        code: "P0001",
        message: "Request approval for the current draft before issuing",
      },
    );
    await expect(issueSavedInvoice(db, "org", "invoice")).rejects.toThrow(
      "Request approval",
    );
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
