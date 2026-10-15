"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ContactPicker } from "./contact-picker";
import { Field, Notice } from "./ui";
import { saveExpense } from "@/lib/server/finance-actions";
import {
  parseMoney,
  decimalMoney,
  taxAmounts,
  money,
} from "@/lib/domain/money";
import { businessDate } from "@/lib/domain/validation";
import type {
  Organization,
  Expense,
  Category,
  Contact,
  TaxMode,
} from "@/lib/domain/types";
export function ExpenseEditor({
  organization,
  expense,
  categories,
  contact,
}: {
  organization: Organization;
  expense?: Expense;
  categories: Category[];
  contact?: Contact;
}) {
  const router = useRouter();
  const [id] = useState(() => expense?.id ?? crypto.randomUUID()),
    [supplier, setSupplier] = useState(expense?.supplier_id ?? ""),
    [status, setStatus] = useState(expense?.payment_status ?? "unknown"),
    [mode, setMode] = useState<TaxMode>(expense?.tax_mode ?? "gst_free"),
    [amount, setAmount] = useState(
      expense ? decimalMoney(expense.entered_cents) : "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  let preview = "";
  try {
    preview = `Total ${money(taxAmounts(BigInt(parseMoney(amount || "0")), mode).total_cents)} · GST ${money(taxAmounts(BigInt(parseMoney(amount || "0")), mode).tax_cents)}`;
  } catch {
    preview = "Check the amount.";
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await saveExpense({
        id,
        isNew: !expense,
        description: f.get("description"),
        transacted: f.get("date"),
        paid_on: status === "paid" ? f.get("paid_date") : null,
        payment_state: status,
        category: f.get("category"),
        supplier: supplier || null,
        amount: parseMoney(amount),
        mode,
        notes: f.get("notes"),
      });
      if (!r.ok) setError(r.message);
      else {
        router.push(`/workspace/expenses/${r.id}`);
        router.refresh();
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel narrow" onSubmit={submit}>
      <div className="form-stack">
        <Field label="What was the expense?">
          <input
            name="description"
            defaultValue={expense?.description}
            required
            maxLength={1000}
            placeholder="A short description"
          />
        </Field>
        <div className="field-grid">
          <Field label="Expense date">
            <input
              name="date"
              type="date"
              required
              defaultValue={
                expense?.transaction_date ?? businessDate(organization.timezone)
              }
            />
          </Field>
          <Field label="Category">
            <select
              name="category"
              defaultValue={
                expense?.category_id ??
                categories.find((c) => c.name === "Uncategorised")?.id
              }
              required
            >
              {categories.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount AUD">
            <input
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="GST treatment">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as TaxMode)}
            >
              {organization.gst_registered && (
                <>
                  <option value="exclusive">GST exclusive</option>
                  <option value="inclusive">GST inclusive</option>
                </>
              )}
              <option value="gst_free">GST free</option>
              <option value="out_of_scope">Out of scope</option>
            </select>
          </Field>
          <Field label="Payment status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="unknown">Unknown</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
          </Field>
          {status === "paid" && (
            <Field label="Payment date">
              <input
                name="paid_date"
                type="date"
                required
                defaultValue={
                  expense?.paid_date ?? businessDate(organization.timezone)
                }
              />
            </Field>
          )}
        </div>
        <ContactPicker
          org={organization.id}
          kind="supplier"
          value={supplier}
          onChange={setSupplier}
          initial={contact}
        />
        <Field label="Notes">
          <textarea
            name="notes"
            defaultValue={expense?.notes}
            maxLength={4000}
          />
        </Field>
        <Notice>
          {preview}. Only paid expenses enter recorded cash outflow.
        </Notice>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
      <div className="form-footer">
        <Link className="text-link" href="/workspace/expenses">
          Cancel
        </Link>
        <button className="button" disabled={busy || !categories.length}>
          {busy ? <span className="spinner" /> : "Save expense"}
        </button>
      </div>
    </form>
  );
}
