"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { checkout, billingPortal } from "@/lib/server/billing-actions";
import { Notice } from "./ui";
import { money } from "@/lib/domain/money";
import type { Plan } from "@/lib/domain/plans";
export function BillingPlans({
  plans,
  enabled,
  canAdmin,
  hasCustomer,
}: {
  plans: Plan[];
  enabled: boolean;
  canAdmin: boolean;
  hasCustomer: boolean;
}) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [keys] = useState(() =>
      Object.fromEntries(plans.map((p) => [p.id, crypto.randomUUID()])),
    );
  async function start(plan?: string) {
    setBusy(plan ?? "portal");
    setError("");
    try {
      const r = plan
        ? await checkout({ plan, key: keys[plan] })
        : await billingPortal();
      if (!r.ok) setError(r.message);
      else if (r.url) window.location.assign(r.url);
    } catch {
      setError("Could not reach billing. Retry safely.");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      {hasCustomer && canAdmin && (
        <div className="toolbar">
          <button
            className="button button-secondary"
            disabled={!!busy || !enabled}
            onClick={() => start()}
          >
            Manage billing / cancellation
          </button>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="card-grid">
        {plans.map((p, i) => (
          <article
            className={`panel ${i === 1 ? "plan-featured" : ""}`}
            key={p.id}
          >
            <span className="eyebrow">{p.name}</span>
            <div className="price">
              {money(p.cents)}
              <span> AUD / month</span>
            </div>
            <p className="muted">{p.description}</p>
            <ul className="feature-list">
              {p.features.map((f) => (
                <li key={f}>
                  <Check size={14} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              className="button"
              disabled={!!busy || !enabled || !canAdmin}
              onClick={() => start(p.id)}
            >
              {busy === p.id ? (
                <span className="spinner" />
              ) : !enabled ? (
                "Billing not connected"
              ) : !canAdmin ? (
                "Admin access required"
              ) : (
                `Choose ${p.name}`
              )}
            </button>
          </article>
        ))}
      </div>
    </>
  );
}
