"use client";
import { useState, useEffect } from "react";
import { browserClient } from "@/lib/supabase/client";
import { searchText } from "@/lib/domain/validation";
import { Field, Notice } from "./ui";
import type { Contact } from "@/lib/domain/types";
export function ContactPicker({
  org,
  kind,
  value,
  onChange,
  initial,
}: {
  org: string;
  kind: "customer" | "supplier";
  value: string;
  onChange: (value: string) => void;
  initial?: Contact;
}) {
  const [q, setQ] = useState(""),
    [items, setItems] = useState<Pick<Contact, "id" | "name">[]>(
      initial ? [initial] : [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        let query = browserClient()
          .from("contacts")
          .select("id,name")
          .eq("organization_id", org)
          .eq("type", kind)
          .eq("archived", false);
        const term = searchText(q);
        if (term) query = query.ilike("name", `%${term}%`);
        const { data, error } = await query.order("name").limit(30);
        if (error) throw error;
        if (!cancelled) {
          setItems((current) => {
            const selected = current.find((x) => x.id === value);
            const rows = data ?? [];
            return selected && !rows.some((x) => x.id === selected.id)
              ? [selected, ...rows]
              : rows;
          });
          setError("");
        }
      } catch {
        if (!cancelled)
          setError("Could not load contacts. Change the search to retry.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, org, kind, value]);
  return (
    <div>
      <input
        className="control"
        style={{ marginBottom: 8 }}
        placeholder={`Search ${kind}s by name`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={`Search ${kind} options`}
      />
      <Field
        label={kind === "customer" ? "Customer" : "Supplier (optional)"}
        hint="Search to find contacts beyond the first 30."
      >
        <select
          aria-label={kind === "customer" ? "Customer" : "Supplier (optional)"}
          required={kind === "customer"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">
            {busy ? "Loading contacts…" : `Select ${kind}`}
          </option>
          {items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
