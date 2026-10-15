import type { InvoiceLine, TaxMode } from "./types";
const MAX = 1_000_000_000_000n;
export const CALCULATION_VERSION = 1;

function scaled(value: string, places: number): bigint {
  const trimmed = value.trim();
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(trimmed))
    throw new Error(
      `Use a positive number with at most ${places} decimal places.`,
    );
  const [whole, fraction = ""] = trimmed.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0"))
  );
}
export function parseMoney(value: string): number {
  const cents = scaled(value, 2);
  if (cents > MAX) throw new Error("Amount exceeds the supported limit.");
  return Number(cents);
}
export function roundRatio(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error("The denominator must be positive.");
  return n < 0n ? -roundRatio(-n, d) : (n * 2n + d) / (2n * d);
}
export function taxAmounts(grossInput: bigint, mode: TaxMode) {
  let base = grossInput,
    tax = 0n,
    total = grossInput;
  if (mode === "exclusive") {
    tax = roundRatio(base, 10n);
    total += tax;
  }
  if (mode === "inclusive") {
    tax = roundRatio(total, 11n);
    base -= tax;
  }
  if (total > MAX || total < 0n)
    throw new Error("Total exceeds the supported limit.");
  return {
    subtotal_cents: Number(base),
    tax_cents: Number(tax),
    total_cents: Number(total),
  };
}
export function lineAmounts(line: InvoiceLine) {
  const quantity = scaled(line.quantity.toString(), 4);
  if (
    quantity <= 0n ||
    quantity > 10_000_000_000n ||
    !Number.isSafeInteger(line.unit_cents) ||
    line.unit_cents < 0
  )
    throw new Error("Check quantity and unit price.");
  return taxAmounts(
    roundRatio(quantity * BigInt(line.unit_cents), 10000n),
    line.tax_mode,
  );
}
export function invoiceAmounts(lines: InvoiceLine[]) {
  let subtotal = 0n,
    tax = 0n,
    total = 0n;
  for (const line of lines) {
    const amounts = lineAmounts(line);
    subtotal += BigInt(amounts.subtotal_cents);
    tax += BigInt(amounts.tax_cents);
    total += BigInt(amounts.total_cents);
  }
  if (total > MAX)
    throw new Error("Invoice total exceeds the supported limit.");
  return {
    subtotal_cents: Number(subtotal),
    tax_cents: Number(tax),
    total_cents: Number(total),
  };
}
export function money(cents: number | string | null | undefined) {
  const value = Number(cents ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value / 100);
}
export function decimalMoney(cents: number) {
  if (!Number.isSafeInteger(cents)) throw new Error("Invalid amount.");
  const n = BigInt(cents);
  return `${n < 0n ? "-" : ""}${(n < 0n ? -n : n) / 100n}.${((n < 0n ? -n : n) % 100n).toString().padStart(2, "0")}`;
}
export function percentMargin(revenue: number, cost: number) {
  if (revenue <= 0) throw new Error("Revenue must be greater than zero.");
  return (
    Number(roundRatio(BigInt(revenue - cost) * 10000n, BigInt(revenue))) / 100
  );
}
export function breakEvenUnits(fixed: number, price: number, variable: number) {
  if (fixed < 0 || price <= variable)
    throw new Error("Selling price must exceed variable cost.");
  return Number(
    (BigInt(fixed) + BigInt(price - variable) - 1n) / BigInt(price - variable),
  );
}
export function runwayMonths(cash: number, monthlyBurn: number) {
  if (monthlyBurn <= 0)
    throw new Error("Enter positive monthly net cash outflow.");
  return Number(roundRatio(BigInt(cash) * 100n, BigInt(monthlyBurn))) / 100;
}
