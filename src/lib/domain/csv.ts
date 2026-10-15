import { validAbn } from "./validation";
import { parseMoney } from "./money";
export type ImportKind = "customers" | "suppliers" | "expenses";
export const COLUMNS: Record<ImportKind, string[]> = {
  customers: ["name", "email", "phone", "abn", "address", "notes"],
  suppliers: ["name", "email", "phone", "abn", "address", "notes"],
  expenses: [
    "description",
    "date",
    "amount",
    "category",
    "tax_mode",
    "status",
    "paid_date",
    "currency",
    "notes",
  ],
};
export function parseCsv(text: string): string[][] {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
    throw new Error("CSV files must be 2 MB or smaller.");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const value = text.replace(/^\uFEFF/, "");
  function pushCell() {
    row.push(cell);
    cell = "";
    closed = false;
  }
  function pushRow() {
    pushCell();
    if (row.some((v) => v.trim() !== "")) rows.push(row);
    row = [];
    if (rows.length > 1001)
      throw new Error("Import up to 1,000 data rows at a time.");
  }
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quoted) {
      if (ch === '"') {
        if (value[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      if (cell || closed) throw new Error("Unexpected quote in CSV.");
      quoted = true;
    } else if (ch === ",") pushCell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && value[i + 1] === "\n") i++;
      pushRow();
    } else {
      if (closed) throw new Error("Unexpected text after a quoted field.");
      cell += ch;
    }
  }
  if (quoted) throw new Error("A quoted field was not closed.");
  if (cell || row.length || closed) pushRow();
  if (!rows.length) throw new Error("The file is empty.");
  if (
    rows[0].some((x) => !x.trim()) ||
    new Set(rows[0]).size !== rows[0].length
  )
    throw new Error("Column headers must be non-empty and unique.");
  if (rows.some((r) => r.length !== rows[0].length))
    throw new Error("All CSV rows must have the same column count.");
  return rows;
}
function validAuDate(value: string) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;
  const [d, m, y] = value.split("/").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}
export function validateImport(
  kind: ImportKind,
  rows: string[][],
  mapping: Record<string, string>,
) {
  const headers = rows[0],
    errors: { row: number; message: string }[] = [],
    values: Record<string, string>[] = [];
  const signatures = new Set<string>();
  let duplicates = 0;
  for (let i = 1; i < rows.length; i++) {
    const record: Record<string, string> = {};
    for (const column of COLUMNS[kind]) {
      const index = headers.indexOf(mapping[column]);
      record[column] = index < 0 ? "" : rows[i][index].trim();
    }
    try {
      if (kind === "expenses") {
        if (!record.description || record.description.length > 1000)
          throw new Error("Add a description of up to 1,000 characters.");
        if (!validAuDate(record.date))
          throw new Error("Use a valid DD/MM/YYYY expense date.");
        if (parseMoney(record.amount) <= 0)
          throw new Error("Enter a positive amount.");
        record.currency ||= "AUD";
        if (record.currency !== "AUD")
          throw new Error("Only AUD is supported.");
        record.status ||= "unknown";
        if (!["paid", "unpaid", "unknown"].includes(record.status))
          throw new Error("Status must be paid, unpaid or unknown.");
        if (record.status === "paid" && !validAuDate(record.paid_date))
          throw new Error(
            "Paid expenses need a valid DD/MM/YYYY payment date.",
          );
        if (record.status !== "paid" && record.paid_date)
          throw new Error("Only paid expenses can have a payment date.");
        record.tax_mode ||= "gst_free";
        if (
          !["exclusive", "inclusive", "gst_free", "out_of_scope"].includes(
            record.tax_mode,
          )
        )
          throw new Error("Choose a supported tax mode.");
        record.category ||= "Uncategorised";
      } else {
        if (!record.name || record.name.length > 160)
          throw new Error("Add a name of up to 160 characters.");
        if (record.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.email))
          throw new Error("Check the email address.");
        if (!validAbn(record.abn)) throw new Error("Check the ABN checksum.");
      }
      const signature = JSON.stringify(record);
      if (signatures.has(signature)) {
        duplicates++;
        continue;
      }
      signatures.add(signature);
      values.push(record);
    } catch (e) {
      errors.push({
        row: i + 1,
        message: e instanceof Error ? e.message : "Invalid row.",
      });
    }
  }
  return { values, errors, duplicates };
}
export function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  const safe =
    typeof value === "string" && /^[\s]*[=+@\-\t\r]/.test(raw)
      ? `'${raw}`
      : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
export function csvRow(values: unknown[]) {
  return values.map(csvCell).join(",") + "\r\n";
}
