"use client";
import Link from "next/link";
import { useState, useEffect, useId, useRef } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { browserClient } from "@/lib/supabase/client";
import { searchText } from "@/lib/domain/validation";
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
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(initial?.name ?? ""),
    [selected, setSelected] = useState<
      Pick<Contact, "id" | "name"> | undefined
    >(initial),
    [items, setItems] = useState<Pick<Contact, "id" | "name">[]>(
      initial ? [initial] : [],
    ),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [retry, setRetry] = useState(0);
  const label = kind === "customer" ? "Customer" : "Supplier (optional)";
  const term = value && selected?.name === q ? "" : searchText(q);
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
        if (term) query = query.ilike("name", `%${term}%`);
        const { data, error } = await query.order("name").limit(30);
        if (error) throw error;
        if (!cancelled) {
          setItems(data ?? []);
          setActive(0);
          setError("");
        }
      } catch {
        if (!cancelled) setError(`Could not load ${kind}s. Please try again.`);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, q, org, kind, retry]);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  function choose(contact: Pick<Contact, "id" | "name">) {
    setSelected(contact);
    setQ(contact.name);
    onChange(contact.id);
    setOpen(false);
    input.current?.focus();
  }
  return (
    <div
      className="field contact-picker"
      ref={root}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id} id={`${id}-label`}>
        {label}
      </label>
      <div className={`contact-picker-input${value ? " has-selection" : ""}`}>
        {value ? (
          <Check size={17} aria-hidden="true" />
        ) : (
          <Search size={17} aria-hidden="true" />
        )}
        <input
          id={id}
          ref={input}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && !busy && !error && items[active]
              ? `${id}-option-${active}`
              : undefined
          }
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          spellCheck={false}
          name={`${kind}-search`}
          placeholder={`Search and select a ${kind}`}
          value={q}
          required={kind === "customer"}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQ(event.target.value);
            if (value) onChange("");
            setBusy(true);
            setError("");
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) {
                setOpen(true);
                setActive(
                  event.key === "ArrowDown" ? 0 : Math.max(0, items.length - 1),
                );
              } else if (items.length)
                setActive(
                  (index) =>
                    (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      items.length) %
                    items.length,
                );
            } else if (open && event.key === "Enter") {
              event.preventDefault();
              if (!busy && !error && items[active]) choose(items[active]);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            } else if (event.key === "Tab") setOpen(false);
            else if (open && ["Home", "End"].includes(event.key)) {
              event.preventDefault();
              setActive(
                event.key === "Home" ? 0 : Math.max(0, items.length - 1),
              );
            }
          }}
        />
        {q ? (
          <button
            type="button"
            className="contact-clear"
            aria-label={`Clear ${kind}`}
            onClick={() => {
              setQ("");
              setSelected(undefined);
              onChange("");
              setOpen(true);
              input.current?.focus();
            }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        ) : (
          <ChevronDown size={16} aria-hidden="true" />
        )}
      </div>
      <small
        id={`${id}-hint`}
        className="contact-picker-hint"
        aria-live="polite"
      >
        {value
          ? `${selected?.name ?? "Contact"} selected`
          : busy
            ? `Searching ${kind}s…`
            : `Choose a ${kind} from the results${kind === "supplier" ? ", or leave blank" : ""}.`}
      </small>
      {open && (
        <div className="contact-picker-menu">
          <div className="contact-picker-menu-label">
            {busy
              ? "Searching…"
              : error
                ? "Search unavailable"
                : `${items.length}${items.length === 30 ? "+" : ""} ${kind}${items.length === 1 ? "" : "s"} found`}
          </div>
          <div
            id={`${id}-options`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            aria-busy={busy}
            className="contact-results"
          >
            {!busy &&
              !error &&
              items.map((contact, index) => (
                <div
                  key={contact.id}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={value === contact.id}
                  className={`contact-option${active === index ? " is-active" : ""}`}
                  onPointerMove={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(contact)}
                >
                  <span className="contact-avatar" aria-hidden="true">
                    {contact.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="contact-option-name">{contact.name}</span>
                  {value === contact.id && (
                    <Check size={16} aria-hidden="true" />
                  )}
                </div>
              ))}
          </div>
          {busy && (
            <p className="contact-menu-state" role="status">
              <span className="spinner" /> Loading {kind}s…
            </p>
          )}
          {error && (
            <div className="contact-menu-state" role="alert">
              {error}
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setBusy(true);
                  setRetry((n) => n + 1);
                }}
              >
                Try again
              </button>
            </div>
          )}
          {!busy && !error && !items.length && (
            <p className="contact-menu-state">
              No {kind}s match “{q}”. Try another name.
            </p>
          )}
          <Link
            href={`/workspace/contacts/new?kind=${kind}`}
            className="contact-add"
          >
            Add a new {kind}
          </Link>
        </div>
      )}
    </div>
  );
}
