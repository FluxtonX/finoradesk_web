import { workspaceContext } from "@/lib/server/context";
import { billingConfigured, type WebBilling } from "@/lib/server/billing";
import { pilotPlans, PLAN_NOTICE } from "@/lib/domain/plans";
import { BillingPlans } from "@/components/billing-plans";
import { PageHeading, Notice, Status, DateLabel } from "@/components/ui";
export default async function Billing({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; access?: string }>;
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
    p = await searchParams;
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
      {p.access === "required" && (
        <Notice>
          Choose an active subscription to create or change financial records.
        </Notice>
      )}
      {p.checkout === "returned" && (
        <Notice>
          Checkout returned. Subscription status updates only after a verified
          provider event.
        </Notice>
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
        <div className="panel" style={{ marginBottom: 20 }}>
          <h2>{state.plan_id} plan</h2>
          <Status value={state.status} />
          {state.current_period_end && (
            <p style={{ marginTop: 12 }}>
              Current period ends <DateLabel value={state.current_period_end} />
              {state.cancel_at_period_end ? " · Cancellation scheduled" : ""}
            </p>
          )}
        </div>
      )}
      <BillingPlans
        plans={pilotPlans(process.env)}
        enabled={enabled}
        canAdmin={canAdmin}
        hasCustomer={!!state?.stripe_customer_id}
      />
      <p className="muted" style={{ fontSize: 11, marginTop: 20 }}>
        {PLAN_NOTICE}
      </p>
    </>
  );
}
