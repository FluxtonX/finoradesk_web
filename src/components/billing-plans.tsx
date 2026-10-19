"use client";
import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Check, CircleCheck } from "lucide-react";
import { checkout, billingPortal } from "@/lib/server/billing-actions";
import { Notice } from "./ui";
import { money } from "@/lib/domain/money";
import type { Plan, PlanId } from "@/lib/domain/plans";
export function BillingPlans({
  plans,
  enabled,
  canAdmin,
  hasCustomer,
  currentPlanId = null,
  hasSubscription = false,
}: {
  plans: Plan[];
  enabled: boolean;
  canAdmin: boolean;
  hasCustomer: boolean;
  currentPlanId?: PlanId | null;
  hasSubscription?: boolean;
}) {
  const currentPlanIndex = plans.findIndex((p) => p.id === currentPlanId),
    reviewSubscription = hasSubscription && currentPlanIndex < 0;
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [keys] = useState(() =>
      Object.fromEntries(plans.map((p) => [p.id, crypto.randomUUID()])),
    );
  async function start(plan?: string) {
    if (plan && plan === currentPlanId) return;
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
      <div className="card-grid billing-plans">
        {plans.map((p, i) => {
          const isCurrent = p.id === currentPlanId,
            isUpgrade = currentPlanIndex >= 0 && i > currentPlanIndex,
            isDowngrade = currentPlanIndex >= 0 && i < currentPlanIndex;
          return (
            <article
              className={`panel billing-plan${isCurrent ? " billing-plan-current" : ""}`}
              key={p.id}
              aria-labelledby={`billing-plan-${p.id}`}
              aria-current={isCurrent ? "true" : undefined}
            >
              <div className="billing-plan-header">
                <h2 className="eyebrow" id={`billing-plan-${p.id}`}>
                  {p.name}
                </h2>
                {isCurrent && (
                  <span className="billing-plan-badge">
                    <CircleCheck size={14} aria-hidden="true" /> Your current
                    plan
                  </span>
                )}
              </div>
              <div className="price">
                {money(p.cents)}
                <span> AUD / month</span>
              </div>
              <p className="muted">{p.description}</p>
              <ul className="feature-list">
                {p.features.map((f) => (
                  <li key={f}>
                    <Check size={14} aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className={`button${isDowngrade ? " button-secondary" : ""}`}
                disabled={isCurrent || !!busy || !enabled || !canAdmin}
                onClick={() => start(reviewSubscription ? undefined : p.id)}
              >
                {isCurrent ? (
                  <>
                    <CircleCheck size={16} aria-hidden="true" /> Current plan
                  </>
                ) : busy === p.id ? (
                  <span className="spinner" />
                ) : !enabled ? (
                  "Billing not connected"
                ) : !canAdmin ? (
                  "Admin access required"
                ) : reviewSubscription ? (
                  "Review subscription"
                ) : isUpgrade ? (
                  <>
                    Upgrade to {p.name}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </>
                ) : isDowngrade ? (
                  <>
                    Downgrade to {p.name}
                    <ArrowDownRight size={16} aria-hidden="true" />
                  </>
                ) : (
                  `Choose ${p.name}`
                )}
              </button>
            </article>
          );
        })}
      </div>
      {currentPlanIndex >= 0 && canAdmin && (
        <p className="muted billing-plan-hint">
          Review plan changes and any price adjustment before confirming in
          Stripe. A smaller plan must have enough seats for your active users.
        </p>
      )}
    </>
  );
}
