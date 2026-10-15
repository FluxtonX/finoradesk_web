"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "./action-button";
import { Field, Notice } from "./ui";
import {
  issueInvoice,
  recordPayment,
  voidInvoice,
} from "@/lib/server/finance-actions";
import { parseMoney, decimalMoney } from "@/lib/domain/money";
import { InvoiceEmail, type EmailDeliveryRow } from "./invoice-email";
import type { Invoice } from "@/lib/domain/types";
export function InvoiceControls({
  invoice,
  role,
  today,
  timezone = "Australia/Sydney",
  emailEnabled = false,
  reminderSchedule = null,
  emailDeliveries = [],
}: {
  invoice: Invoice;
  role: string;
  today: string;
  timezone?: string;
  emailEnabled?: boolean;
  reminderSchedule?: {
    opted_in: boolean;
    runs: number;
    next_run_at: string;
  } | null;
  emailDeliveries?: EmailDeliveryRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [reason, setReason] = useState(""),
    [key, setKey] = useState(() => crypto.randomUUID());
  if (role === "viewer")
    return <Notice>You have view-only access to this business.</Notice>;
  async function payment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await recordPayment({
        id: invoice.id,
        cents: parseMoney(String(f.get("amount"))),
        date: f.get("date"),
        reference: f.get("reference"),
        key,
      });
      if (!r.ok) setError(r.message);
      else {
        setMessage(r.message);
        setKey(crypto.randomUUID());
        router.refresh();
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection interrupted. Retry the same request.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <h2>Next steps</h2>
      {invoice.state === "draft" && (
        <>
          <p className="muted">
            Issuing assigns a number and locks the financial details.
          </p>
          <ActionButton
            action={() => issueInvoice(invoice.id)}
            confirm="Issue this invoice and lock its amounts and customer snapshot?"
            className="button"
          >
            Issue invoice
          </ActionButton>
        </>
      )}
      {invoice.state === "issued" && (
        <>
          <a
            className="button button-secondary"
            href={`/workspace/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Download invoice PDF
          </a>
          <hr className="divider" />
          {invoice.outstanding_cents > 0 && (
            <>
              <h3>Record a payment</h3>
              <p className="muted" style={{ fontSize: 11 }}>
                For a payment you have confirmed. No bank transaction is
                initiated.
              </p>
              <form
                className="form-stack"
                onSubmit={payment}
                onChange={() => setKey(crypto.randomUUID())}
              >
                <Field label="Amount AUD">
                  <input
                    name="amount"
                    inputMode="decimal"
                    required
                    defaultValue={decimalMoney(invoice.outstanding_cents)}
                  />
                </Field>
                <Field label="Payment date">
                  <input
                    name="date"
                    type="date"
                    max={today}
                    defaultValue={today}
                    required
                  />
                </Field>
                <Field label="Reference (optional)">
                  <input name="reference" maxLength={500} />
                </Field>
                <button className="button" disabled={busy}>
                  {busy ? <span className="spinner" /> : "Record payment"}
                </button>
              </form>
            </>
          )}
          {message && <Notice tone="success">{message}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <hr className="divider" />
          <InvoiceEmail
            timezone={timezone}
            invoice={invoice}
            enabled={emailEnabled}
            schedule={reminderSchedule}
            deliveries={emailDeliveries}
          />
          {invoice.paid_cents === 0 && (
            <>
              <hr className="divider" />
              <Field label="Reason for voiding">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={3}
                  maxLength={1000}
                />
              </Field>
              <div className="toolbar">
                <ActionButton
                  action={() => voidInvoice(invoice.id, reason)}
                  confirm="Void this unpaid invoice? Its history will be retained."
                  className="button button-danger"
                >
                  Void invoice
                </ActionButton>
              </div>
            </>
          )}
        </>
      )}
      {invoice.state === "void" && (
        <p className="muted">
          This invoice has been voided. Its records remain available.
        </p>
      )}
    </div>
  );
}
