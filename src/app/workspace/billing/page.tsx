import { workspaceContext } from "@/lib/server/context";
import { billingConfigured, type WebBilling } from "@/lib/server/billing";
import { pilotPlans, PLAN_NOTICE } from "@/lib/domain/plans";
import { BillingPlans } from "@/components/billing-plans";
import { BillingConfirmation } from "@/components/billing-confirmation";
import { PageHeading, Notice, Status, DateLabel } from "@/components/ui";
export default async function Billing({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; access?: string; plan?: string }>;
}) {
  const c = await workspaceContext(),
    canAdmin = ["owner", "admin"].includes(c.role);
  const result = canAdmin
    ? await c.db
        .from("web_billing_profiles")
        .select("*")
        .eq("organization_id", c.organization.id)
        .maybeSingle()
    : null;
  const state = result?.data as WebBilling | null,
    p = await searchParams,
    plans = pilotPlans(process.env),
    subscriptionPlan = plans.find((plan) => plan.id === state?.plan_id),
    currentPlan =
      state?.stripe_subscription_id &&
      ["active", "trialing"].includes(state.status) &&
      (!state.current_period_end ||
        new Date(state.current_period_end).getTime() > Date.now())
        ? subscriptionPlan
        : undefined;
  const enabled =
    billingConfigured() &&
    !result?.error &&
    ["inclusive", "exclusive"].includes(process.env.BILLING_TAX_MODE ?? "");
  return (
    <>
      <PageHeading
        title="Room for your next chapter."
        description="Simple, adjustable pilot plans for your business."
      />
      {enabled && process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") && (
        <Notice>Test billing is enabled. No real money is charged.</Notice>
      )}
      {p.access === "required" && (
        <Notice>
          Choose an active subscription to create or change financial records.
        </Notice>
      )}
      {p.checkout === "returned" && canAdmin && enabled && (
        <BillingConfirmation
          confirmed={
            c.canWrite &&
            ["active", "trialing"].includes(state?.status ?? "") &&
            (!p.plan || state?.plan_id === p.plan)
          }
        />
      )}
      {p.checkout === "cancelled" && (
        <Notice>
          Checkout was cancelled. No subscription success is assumed.
        </Notice>
      )}
      {!enabled && (
        <Notice>
          Billing setup is pending. No payment will be taken from this screen.
        </Notice>
      )}
      {state?.stripe_subscription_id && (
        <div className="panel billing-summary">
          <div>
            <span className="eyebrow">Your subscription</span>
            <h2>
              {subscriptionPlan
                ? `${subscriptionPlan.name} plan`
                : "Subscription details"}
            </h2>
            <Status value={state.status} />
          </div>
          {state.current_period_end && (
            <div className="billing-summary-period">
              <p>
                {state.cancel_at_period_end
                  ? "Access until"
                  : "Current period ends"}
              </p>
              <strong>
                <DateLabel value={state.current_period_end} />
              </strong>
              {state.cancel_at_period_end && <p>Cancellation scheduled</p>}
            </div>
          )}
        </div>
      )}
      <BillingPlans
        plans={plans}
        enabled={enabled}
        canAdmin={canAdmin}
        hasCustomer={!!state?.stripe_customer_id}
        currentPlanId={currentPlan?.id ?? null}
        hasSubscription={!!state?.stripe_subscription_id}
      />
      <p className="muted" style={{ fontSize: 11, marginTop: 20 }}>
        {PLAN_NOTICE}
      </p>
    </>
  );
}
