import "server-only";
import type Stripe from "stripe";
import type { Plan } from "@/lib/domain/plans";
export async function planChangePortal(
  stripe: Stripe,
  customer: string,
  subscriptionId: string,
  plan: Plan,
  origin: string,
  tax: "inclusive" | "exclusive",
) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.items.data.length !== 1)
    throw new Error(
      "This subscription needs a reviewed plan change. Contact support.",
    );
  const product = await stripe.products.create(
    { name: `Finoredesk ${plan.name}`, metadata: { finoredesk_plan: plan.id } },
    { idempotencyKey: `finoredesk-product:${plan.id}:${plan.cents}:${tax}` },
  );
  const price = await stripe.prices.create(
    {
      product: product.id,
      currency: "aud",
      unit_amount: plan.cents,
      recurring: { interval: "month" },
      tax_behavior: tax,
    },
    { idempotencyKey: `finoredesk-price:${plan.id}:${plan.cents}:${tax}` },
  );
  // The general portal cannot bypass the app's team-capacity check. This
  // confirmation session exposes only the plan already checked by the server.
  const configuration = await stripe.billingPortal.configurations.create(
    {
      name: `Finoredesk ${plan.name} confirmation`,
      metadata: { application: "finoredesk", purpose: "plan_change" },
      business_profile: { headline: "Confirm your Finoredesk plan" },
      features: {
        invoice_history: { enabled: false },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: false },
        subscription_update: {
          enabled: true,
          default_allowed_updates: ["price"],
          proration_behavior: "create_prorations",
          products: [{ product: product.id, prices: [price.id] }],
        },
      },
    },
    { idempotencyKey: `finoredesk-confirm:${plan.id}:${plan.cents}:${tax}` },
  );
  return stripe.billingPortal.sessions.create({
    customer,
    configuration: configuration.id,
    return_url: `${origin}/workspace/billing`,
    flow_data: {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: subscriptionId,
        items: [
          { id: subscription.items.data[0].id, price: price.id, quantity: 1 },
        ],
      },
      after_completion: {
        type: "redirect",
        redirect: {
          return_url: `${origin}/workspace/billing?checkout=returned&plan=${plan.id}`,
        },
      },
    },
  });
}
