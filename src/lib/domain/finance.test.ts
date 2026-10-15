import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import {
  parseMoney,
  lineAmounts,
  invoiceAmounts,
  percentMargin,
  breakEvenUnits,
  runwayMonths,
  decimalMoney,
} from "./money";
import { validAbn, businessDate, validPeriod } from "./validation";
import { safeNext } from "../config";
import { buildInvoicePdf } from "./invoice-pdf";
import type { Invoice, InvoiceLine } from "./types";
describe("version 1 financial rules", () => {
  const line = (
    mode: InvoiceLine["tax_mode"],
    unit = 10000,
    quantity = "1",
  ): InvoiceLine => ({
    description: "Service",
    quantity,
    unit_cents: unit,
    tax_mode: mode,
  });
  it("calculates GST exclusive exactly", () =>
    expect(lineAmounts(line("exclusive"))).toEqual({
      subtotal_cents: 10000,
      tax_cents: 1000,
      total_cents: 11000,
    }));
  it("decomposes GST inclusive exactly", () =>
    expect(lineAmounts(line("inclusive", 11000))).toEqual({
      subtotal_cents: 10000,
      tax_cents: 1000,
      total_cents: 11000,
    }));
  it("keeps GST free and out of scope distinct with no tax", () => {
    for (const mode of ["gst_free", "out_of_scope"] as const)
      expect(lineAmounts(line(mode)).tax_cents).toBe(0);
  });
  it("rounds fractional quantities and half cents per line", () => {
    expect(lineAmounts(line("exclusive", 5, "0.5"))).toEqual({
      subtotal_cents: 3,
      tax_cents: 0,
      total_cents: 3,
    });
    expect(
      invoiceAmounts([line("exclusive", 5), line("exclusive", 5)]).total_cents,
    ).toBe(12);
  });
  it("rejects binary/malformed/unsafe inputs", () => {
    for (const value of ["1e3", "-1", "1.001", "NaN", "90000000000000"])
      expect(() => parseMoney(value)).toThrow();
    expect(() => lineAmounts(line("exclusive", 1, "0"))).toThrow();
  });
  it("parses and formats cents without floating point arithmetic", () => {
    expect(parseMoney("0.29")).toBe(29);
    expect(decimalMoney(-12345)).toBe("-123.45");
  });
  it("handles calculator edge cases", () => {
    expect(percentMargin(10000, 6000)).toBe(40);
    expect(breakEvenUnits(10001, 1000, 500)).toBe(21);
    expect(runwayMonths(10000, 3000)).toBe(3.33);
    expect(() => percentMargin(0, 1)).toThrow();
    expect(() => breakEvenUnits(1, 5, 5)).toThrow();
  });
});
describe("dates and access redirects", () => {
  it("uses business timezone around a UTC day boundary", () =>
    expect(
      businessDate("Australia/Sydney", new Date("2026-10-14T14:00:00Z")),
    ).toBe("2026-10-15"));
  it("rejects invalid/reversed/oversized periods", () => {
    for (const [from, to] of [
      ["2026-02-30", "2026-03-01"],
      ["2026-05-01", "2026-04-01"],
      ["2024-01-01", "2026-01-01"],
    ])
      expect(() => validPeriod(from, to)).toThrow();
    expect(validPeriod("2024-02-29", "2024-03-01").from).toBe("2024-02-29");
  });
  it("rejects external and malformed callback redirects", () => {
    for (const value of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/auth/callback",
      "/workspace\n",
    ])
      expect(safeNext(value)).toBe("/workspace");
    expect(safeNext("/workspace/invoices")).toBe("/workspace/invoices");
    expect(safeNext("/auth/password")).toBe("/auth/password");
  });
  it("validates optional ABNs by checksum", () => {
    expect(validAbn("")).toBe(true);
    expect(validAbn("51824753556")).toBe(true);
    expect(validAbn("51824753557")).toBe(false);
  });
});
describe("issued PDF", () => {
  it("rejects drafts and creates a multi-page issued document", async () => {
    const font = await readFile("assets/fonts/NotoSans-Regular.ttf");
    const invoice = {
      state: "draft",
      number: "INV-000001",
      issue_date: "2026-10-15",
      due_date: "2026-10-29",
      organization_snapshot: { name: "Test business", gst_registered: true },
      contact_snapshot: { name: "Test customer" },
      calculation_version: 1,
      subtotal_cents: 10000,
      tax_cents: 1000,
      total_cents: 11000,
      paid_cents: 4000,
      outstanding_cents: 7000,
      notes: "Use recorded payment reference.",
    } as Invoice;
    await expect(buildInvoicePdf(invoice, [], font)).rejects.toThrow("Issue");
    invoice.state = "issued";
    const lines = Array.from({ length: 65 }, (_, i) => ({
      description: `Line ${i}: long description for multi-page validation`,
      quantity: "1",
      unit_cents: 100,
      tax_mode: "gst_free" as const,
      total_cents: 100,
      tax_cents: 0,
    }));
    const bytes = await buildInvoicePdf(invoice, lines, font);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });
});
