"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createTicket,
  replyTicket,
  platformTicket,
} from "@/lib/server/admin-actions";
import { Field, Notice } from "./ui";
import type { ActionResult } from "@/lib/domain/types";
export function SupportForm({
  ticketId,
  closed = false,
}: {
  ticketId?: string;
  closed?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<ActionResult | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = e.currentTarget,
      f = new FormData(form);
    try {
      const r = ticketId
        ? await replyTicket({ id: ticketId, body: f.get("body") })
        : await createTicket({
            subject: f.get("subject"),
            body: f.get("body"),
          });
      setResult(r);
      if (r.ok) {
        form.reset();
        if (!ticketId) router.push(`/workspace/support/${r.id}`);
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "Connection interrupted. Retry." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      {!ticketId && (
        <Field label="What can we help with?">
          <input
            name="subject"
            required
            maxLength={160}
            placeholder="A question, setup help or a migration request"
          />
        </Field>
      )}
      <Field label={ticketId ? "Your reply" : "A little more detail"}>
        <textarea name="body" required maxLength={4000} disabled={closed} />
      </Field>
      {result && (
        <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>
      )}
      <button className="button" disabled={busy || closed}>
        {busy ? (
          <span className="spinner" />
        ) : closed ? (
          "Ticket closed"
        ) : ticketId ? (
          "Send reply"
        ) : (
          "Create support request"
        )}
      </button>
    </form>
  );
}
export function PlatformTicketForm({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<ActionResult | null>(null);
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const r = await platformTicket({
        id,
        status: f.get("status"),
        body: f.get("body"),
      });
      setResult(r);
      if (r.ok) router.refresh();
    } catch {
      setResult({ ok: false, message: "Could not save. Retry." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <Field label="Ticket state">
        <select name="status" defaultValue={status}>
          {["open", "pending", "closed"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label="Response (optional)">
        <textarea name="body" maxLength={4000} />
      </Field>
      <button className="button button-small" disabled={busy}>
        {busy ? <span className="spinner" /> : "Save response / state"}
      </button>
      {result && (
        <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>
      )}
    </form>
  );
}
