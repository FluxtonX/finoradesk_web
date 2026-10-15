import { z } from "zod";
export const uuid = z.uuid();
export const taxMode = z.enum([
  "exclusive",
  "inclusive",
  "gst_free",
  "out_of_scope",
]);
export function validAbn(input: string) {
  const value = input.replace(/\s/g, "");
  if (!value) return true;
  if (!/^\d{11}$/.test(value)) return false;
  return (
    [...value].reduce(
      (sum, n, i) =>
        sum +
        (Number(n) - (i === 0 ? 1 : 0)) *
          [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19][i],
      0,
    ) %
      89 ===
    0
  );
}
export const dateOnly = z.iso.date();
export const contactInput = z.object({
  id: uuid.optional(),
  type: z.enum(["customer", "supplier"]),
  name: z.string().trim().min(1).max(160),
  email: z.union([z.email(), z.literal("")]),
  phone: z.string().max(60),
  abn: z.string().refine(validAbn, "Check the ABN checksum."),
  address: z.string().max(2000),
  notes: z.string().max(4000),
});
export const invoiceInput = z
  .object({
    id: uuid,
    customer: uuid,
    issued: dateOnly,
    due: dateOnly,
    notes: z.string().max(4000),
    lines: z
      .array(
        z.object({
          description: z.string().trim().min(1).max(1000),
          quantity: z.string().regex(/^\d+(\.\d{1,4})?$/),
          unit_cents: z.number().int().min(0).max(1e12),
          tax_mode: taxMode,
        }),
      )
      .min(1)
      .max(100),
  })
  .refine((x) => x.due >= x.issued, "Due date cannot precede issue date.");
export const expenseInput = z
  .object({
    id: uuid,
    description: z.string().trim().min(1).max(1000),
    transacted: dateOnly,
    paid_on: dateOnly.nullable(),
    payment_state: z.enum(["paid", "unpaid", "unknown"]),
    category: uuid,
    supplier: uuid.nullable(),
    amount: z.number().int().positive().max(1e12),
    mode: taxMode,
    notes: z.string().max(4000),
    isNew: z.boolean(),
  })
  .refine(
    (x) => (x.payment_state === "paid") === (x.paid_on !== null),
    "Paid expenses need a payment date.",
  );
export function searchText(input: string) {
  return input
    .trim()
    .slice(0, 100)
    .replace(/[\\%_(),.*:]/g, " ");
}
export function pagination(value?: string) {
  const n = Number(value ?? 1);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 100000) : 1;
}
export function businessDate(zone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function monthPeriod(zone: string) {
  const today = businessDate(zone),
    [year, month] = today.split("-").map(Number);
  return {
    from: `${today.slice(0, 7)}-01`,
    to: `${today.slice(0, 7)}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`,
  };
}
export function validPeriod(from: string, to: string) {
  if (!dateOnly.safeParse(from).success || !dateOnly.safeParse(to).success)
    throw new Error("Choose valid report dates.");
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (days < 0 || days > 366)
    throw new Error("Choose an ordered period of up to one year.");
  return { from, to };
}
