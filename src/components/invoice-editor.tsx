"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { AiAssist } from "./ai-assist";
import { ContactPicker } from "./contact-picker";
import { Field, Notice } from "./ui";
import { saveInvoice } from "@/lib/server/finance-actions";
import {
  invoiceAmounts,
  money,
  decimalMoney,
  parseMoney,
} from "@/lib/domain/money";
import { businessDate } from "@/lib/domain/validation";
import type {
  Organization,
  Invoice,
  InvoiceLine,
  Contact,
  TaxMode,
} from "@/lib/domain/types";
export function InvoiceEditor({
  organization,
  invoice,
  lines,
  contact,
}: {
  organization: Organization;
  invoice?: Invoice;
  lines?: InvoiceLine[];
  contact?: Contact;
}) {
  const router = useRouter();
  const [id] = useState(() => invoice?.id ?? crypto.randomUUID()),
    [customer, setCustomer] = useState(invoice?.contact_id ?? "");
  const [draft, setDraft] = useState(
    () =>
      lines?.map((l) => ({ ...l, price: decimalMoney(l.unit_cents) })) ?? [
        {
          description: "",
          quantity: "1",
          price: "",
          unit_cents: 0,
          tax_mode: organization.gst_registered
            ? ("exclusive" as TaxMode)
            : ("gst_free" as TaxMode),
        },
      ],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const today = businessDate(organization.timezone),
    dueDate = new Date(`${today}T12:00:00Z`);
  dueDate.setUTCDate(dueDate.getUTCDate() + 14);
  function payload() {
    return draft.map((l) => ({
      description: l.description,
      quantity: String(l.quantity),
      tax_mode: l.tax_mode,
      unit_cents: parseMoney(l.price || "0"),
    }));
  }
  let totals: {
      subtotal_cents: number;
      tax_cents: number;
      total_cents: number;
    } | null = null,
    previewError = "";
  try {
    totals = invoiceAmounts(payload());
  } catch (e) {
    previewError = e instanceof Error ? e.message : "Check line values.";
  }
  function update(index: number, key: string, value: string) {
    setDraft((current) =>
      current.map((l, i) => (i === index ? { ...l, [key]: value } : l)),
    );
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await saveInvoice({
        id,
        customer,
        issued: f.get("issued"),
        due: f.get("due"),
        notes: f.get("notes"),
        lines: payload(),
      });
      if (!r.ok) setError(r.message);
      else {
        router.push(`/workspace/invoices/${r.id}`);
        router.refresh();
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save. Retry safely with this draft.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={submit}>
      <div className="field-grid">
        <ContactPicker
          org={organization.id}
          kind="customer"
          value={customer}
          onChange={setCustomer}
          initial={contact}
        />
        <div className="field-grid">
          <Field label="Issue date">
            <input
              type="date"
              name="issued"
              required
              defaultValue={invoice?.issue_date ?? today}
            />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              name="due"
              required
              defaultValue={
                invoice?.due_date ?? dueDate.toISOString().slice(0, 10)
              }
            />
          </Field>
        </div>
      </div>
      <hr className="divider" />
      <div className="section-title">
        <h2>What’s on this invoice?</h2>
        <span className="muted" style={{ fontSize: 11 }}>
          AUD · Exact per-line rounding
        </span>
      </div>
      {draft.map((line, i) => (
        <div className="line-editor" key={i}>
          <Field label={`Description ${i + 1}`}>
            <input
              required
              maxLength={1000}
              value={line.description}
              onChange={(e) => update(i, "description", e.target.value)}
              placeholder="Service or item"
            />
          </Field>
          <Field label="Quantity">
            <input
              inputMode="decimal"
              required
              value={line.quantity}
              onChange={(e) => update(i, "quantity", e.target.value)}
              pattern="[0-9]+(\.[0-9]{1,4})?"
            />
          </Field>
          <Field label="Unit price">
            <input
              inputMode="decimal"
              required
              value={line.price}
              onChange={(e) => update(i, "price", e.target.value)}
              placeholder="0.00"
              pattern="[0-9]+(\.[0-9]{1,2})?"
            />
          </Field>
          <Field label="GST treatment">
            <select
              value={line.tax_mode}
              onChange={(e) => update(i, "tax_mode", e.target.value)}
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
          <button
            className="icon-button"
            type="button"
            aria-label={`Remove line ${i + 1}`}
            disabled={draft.length === 1}
            onClick={() => setDraft(draft.filter((_, j) => i !== j))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button button-secondary button-small"
        disabled={draft.length >= 100}
        onClick={() =>
          setDraft([
            ...draft,
            {
              description: "",
              quantity: "1",
              price: "",
              unit_cents: 0,
              tax_mode: organization.gst_registered ? "exclusive" : "gst_free",
            },
          ])
        }
      >
        <Plus size={14} />
        Add a line
      </button>
      {invoice && (
        <AiAssist
          kind="invoice"
          targetId={invoice.id}
          onApproved={(text) => update(0, "description", text)}
        />
      )}
      <hr className="divider" />
      <div className="field-grid">
        <Field label="Notes / payment instructions">
          <textarea
            name="notes"
            maxLength={4000}
            defaultValue={invoice?.notes}
            placeholder="Optional instructions for your customer"
          />
        </Field>
        <div className="summary-list">
          {totals ? (
            <>
              <div>
                <span>Subtotal</span>
                <strong>{money(totals.subtotal_cents)}</strong>
              </div>
              <div>
                <span>GST</span>
                <strong>{money(totals.tax_cents)}</strong>
              </div>
              <div className="total">
                <span>Total AUD</span>
                <strong>{money(totals.total_cents)}</strong>
              </div>
            </>
          ) : (
            <Notice tone="error">{previewError}</Notice>
          )}
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="form-footer">
        <small>Save a draft, review it, then issue it.</small>
        <div className="actions">
          <Link href="/workspace/invoices" className="button button-secondary">
            Cancel
          </Link>
          <button className="button" disabled={busy || !totals || !customer}>
            {busy ? <span className="spinner" /> : "Save draft"}
          </button>
        </div>
      </div>
    </form>
  );
}
