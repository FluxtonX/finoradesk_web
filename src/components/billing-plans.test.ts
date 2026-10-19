import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { pilotPlans, type PlanId } from "../lib/domain/plans";
import { BillingPlans } from "./billing-plans";

vi.mock("@/lib/server/billing-actions", () => ({
  checkout: vi.fn(),
  billingPortal: vi.fn(),
}));

function render(currentPlanId: PlanId | null, extra = {}) {
  return renderToStaticMarkup(
    createElement(BillingPlans, {
      plans: pilotPlans(),
      enabled: true,
      canAdmin: true,
      hasCustomer: !!currentPlanId,
      hasSubscription: !!currentPlanId,
      currentPlanId,
      ...extra,
    }),
  );
}

describe("subscription plan choices", () => {
  it.each([
    ["starter", [], ["Growth", "Business"]],
    ["growth", ["Starter"], ["Business"]],
    ["business", ["Starter", "Growth"], []],
  ] as const)(
    "marks %s current and offers the correct plan changes",
    (plan, lower, higher) => {
      const html = render(plan);
      const current = html.match(
        /<article[^>]*aria-current="true"[\s\S]*?<\/article>/,
      )?.[0];
      expect(current).toContain("billing-plan-current");
      expect(current).toContain(`billing-plan-${plan}`);
      expect(current).toContain("Your current plan");
      expect(current).toMatch(/<button[^>]*disabled=""/);
      expect(html.match(/aria-current="true"/g)).toHaveLength(1);
      for (const name of lower) expect(html).toContain(`Downgrade to ${name}`);
      for (const name of higher) expect(html).toContain(`Upgrade to ${name}`);
      expect(html).not.toContain("Choose ");
      expect(html).toContain("Manage billing / cancellation");
    },
  );

  it("offers initial checkout when there is no subscription", () => {
    const html = render(null);
    for (const plan of pilotPlans())
      expect(html).toContain(`Choose ${plan.name}`);
    expect(html).not.toContain('aria-current="true"');
    expect(html).not.toContain("Upgrade to");
    expect(html).not.toContain("Downgrade to");
  });

  it("does not offer a duplicate checkout for a subscription needing review", () => {
    const html = render(null, { hasSubscription: true, hasCustomer: true });
    expect(html.match(/Review subscription/g)).toHaveLength(3);
    expect(html).not.toContain("Choose ");
    expect(html).not.toContain('aria-current="true"');
  });

  it("keeps the current plan visible when billing actions are unavailable", () => {
    const html = render("growth", { enabled: false });
    expect(html).toContain("Your current plan");
    expect(html.match(/Billing not connected/g)).toHaveLength(2);
    expect(html).not.toContain("Upgrade to");
  });

  it("does not offer plan changes to a viewer", () => {
    const html = render("growth", { canAdmin: false });
    expect(html.match(/Admin access required/g)).toHaveLength(2);
    expect(html).not.toContain("Manage billing / cancellation");
    expect(html).not.toContain("Upgrade to");
    expect(html).toContain("Your current plan");
  });
});
