"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Field, Notice } from "./ui";
import { saveContact } from "@/lib/server/finance-actions";
import type { Contact } from "@/lib/domain/types";
export function ContactForm({
  contact,
  kind = "customer",
}: {
  contact?: Contact;
  kind?: "customer" | "supplier";
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      const r = await saveContact({
        id: contact?.id,
        type: kind,
        name: f.get("name"),
        email: f.get("email"),
        phone: f.get("phone"),
        abn: f.get("abn"),
        address: f.get("address"),
        notes: f.get("notes"),
      });
      if (!r.ok) setError(r.message);
      else {
        if (!contact) form.reset();
        router.replace(
          `/workspace/contacts?kind=${kind}&saved=${contact ? "updated" : "created"}`,
        );
        router.refresh();
      }
    } catch {
      setError("Connection interrupted. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel narrow" onSubmit={submit}>
      <div className="field-grid">
        <Field label="Name">
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={contact?.name}
            autoComplete="organization"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            name="email"
            defaultValue={contact?.email}
            maxLength={254}
          />
        </Field>
        <Field label="Phone">
          <input
            name="phone"
            type="tel"
            defaultValue={contact?.phone}
            maxLength={60}
          />
        </Field>
        <Field label="ABN (optional)">
          <input name="abn" defaultValue={contact?.abn ?? ""} maxLength={20} />
        </Field>
        <div className="full">
          <Field label="Address">
            <textarea
              name="address"
              defaultValue={contact?.address}
              maxLength={2000}
            />
          </Field>
        </div>
        <div className="full">
          <Field label="Notes">
            <textarea
              name="notes"
              defaultValue={contact?.notes}
              maxLength={4000}
            />
          </Field>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="form-footer">
        <Link href="/workspace/contacts" className="text-link">
          Cancel
        </Link>
        <button className="button" disabled={busy}>
          {busy ? <span className="spinner" /> : "Save contact"}
        </button>
      </div>
    </form>
  );
}
