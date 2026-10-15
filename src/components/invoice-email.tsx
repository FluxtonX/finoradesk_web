"use client";
import { useState } from "react";
import { ActionButton } from "./action-button";
import {
  queueWebDelivery,
  setWebReminder,
} from "@/lib/server/delivery-actions";
import { Notice, Status, DateLabel } from "./ui";
import type { Invoice } from "@/lib/domain/types";
import { money } from "@/lib/domain/money";
export interface EmailDeliveryRow {
  id: string;
  kind: string;
  state: string;
  recipient: string;
  last_error: string | null;
  created_at: string;
}
export function InvoiceEmail({
  invoice,
  enabled,
  schedule,
  deliveries,
  timezone = "Australia/Sydney",
}: {
  invoice: Invoice;
  enabled: boolean;
  schedule: { opted_in: boolean; runs: number; next_run_at: string } | null;
  deliveries: EmailDeliveryRow[];
  timezone?: string;
}) {
  const [key] = useState(() => crypto.randomUUID()),
    [preview, setPreview] = useState(false);
  return (
    <>
      <h3>Invoice email</h3>
      <p className="muted" style={{ fontSize: 12 }}>
        {enabled
          ? `Send to ${invoice.contact_snapshot?.email ?? "the saved customer email"} with the issued PDF attached.`
          : "Email delivery isn’t connected yet. Download and share the PDF for now."}
      </p>
      {enabled && (
        <>
          <button
            className="button button-secondary button-small"
            onClick={() => setPreview(!preview)}
          >
            {preview ? "Hide email preview" : "Review email"}
          </button>
          {preview && (
            <Notice>
              <strong>
                {invoice.number} from {invoice.organization_snapshot?.name}
              </strong>
              <p style={{ marginTop: 8 }}>
                Hello {invoice.contact_snapshot?.name ?? "there"},<br />
                Please find {invoice.number} attached. The invoice total is{" "}
                {money(invoice.total_cents)}.
              </p>
              <p>
                Due date: <DateLabel value={invoice.due_date} />. Currency: AUD.
              </p>
              {invoice.notes && (
                <p style={{ whiteSpace: "pre-wrap" }}>{invoice.notes}</p>
              )}
              <p>
                Payment status reflects records entered by{" "}
                {invoice.organization_snapshot?.name}. If you have already paid,
                please reply so the records can be reviewed.
              </p>
              <ActionButton
                action={() =>
                  queueWebDelivery({ id: invoice.id, key, kind: "invoice" })
                }
                confirm={`Send this invoice to ${invoice.contact_snapshot?.email}?`}
              >
                Queue invoice email
              </ActionButton>
            </Notice>
          )}
          <hr className="divider" />
          {invoice.outstanding_cents <= 0 ? (
            <Notice>This invoice is paid. Automatic reminders stop.</Notice>
          ) : (
            <>
              <h3>Automatic reminders</h3>
              <p className="muted" style={{ fontSize: 11 }}>
                One day overdue, then weekly. Maximum three at 9am business
                time. Stops when paid, voided or cancelled.
              </p>
              {schedule && (
                <p style={{ fontSize: 11 }}>
                  {schedule.opted_in
                    ? schedule.runs >= 3
                      ? "3 of 3 reminders scheduled. Schedule complete."
                      : `${schedule.runs} of 3 scheduled · Next ${new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(schedule.next_run_at))} (${timezone})`
                    : "Reminders disabled."}
                </p>
              )}
              <ActionButton
                action={() => setWebReminder(invoice.id, !schedule?.opted_in)}
                confirm={
                  schedule?.opted_in
                    ? "Disable future reminders?"
                    : "Enable this reminder policy for this invoice?"
                }
              >
                {schedule?.opted_in ? "Disable reminders" : "Enable reminders"}
              </ActionButton>
            </>
          )}
        </>
      )}
      {deliveries.length > 0 && (
        <div style={{ marginTop: 18 }}>
          {deliveries.map((d) => (
            <div className="row-item" key={d.id}>
              <div className="row-main">
                <strong>
                  {d.kind === "reminder" ? "Reminder" : "Invoice email"}
                </strong>
                <small>
                  <DateLabel value={d.created_at} /> · {d.recipient}
                </small>
                {d.last_error && <small>{d.last_error}</small>}
              </div>
              <Status value={d.state} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
