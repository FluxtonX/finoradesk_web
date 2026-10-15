import { NextRequest, NextResponse } from "next/server";
import {
  verifyStripeEvent,
  eventIsSubscription,
  subscriptionMetadata,
} from "@/lib/domain/stripe-events";
import {
  stripeClient,
  adminClient,
  billingConfigured,
} from "@/lib/server/billing";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!billingConfigured())
    return NextResponse.json(
      { error: "Billing unavailable." },
      { status: 503 },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 1048576)
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  const body = await request.text();
  if (body.length > 1048576)
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  let event;
  try {
    event = verifyStripeEvent(
      body,
      request.headers.get("stripe-signature") ?? "",
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  if (!eventIsSubscription(event)) return NextResponse.json({ received: true });
  try {
    const snapshot = event.data.object as { id: string };
    const subscription = await stripeClient().subscriptions.retrieve(
      snapshot.id,
    );
    let meta = subscriptionMetadata(subscription.metadata);
    const productId = subscription.items.data[0]?.price.product;
    if (productId) {
      const product =
        typeof productId === "string"
          ? await stripeClient().products.retrieve(productId)
          : productId;
      if (!("deleted" in product) && product.metadata.finoredesk_plan)
        meta = subscriptionMetadata({
          ...subscription.metadata,
          plan_id: product.metadata.finoredesk_plan,
        });
    }
    const customer =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    const server = adminClient();
    const { data: profile, error: profileError } = await server
      .from("web_billing_profiles")
      .select("stripe_customer_id")
      .eq("organization_id", meta.organization_id)
      .single();
    if (profileError || profile?.stripe_customer_id !== customer)
      return NextResponse.json(
        { error: "Unknown subscription owner." },
        { status: 409 },
      );
    const periodEnd = subscription.items.data[0]?.current_period_end;
    const { error } = await server.rpc("apply_web_subscription_event", {
      org: meta.organization_id,
      customer,
      subscription: subscription.id,
      plan: meta.plan_id,
      subscription_status: subscription.status,
      period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancelling: subscription.cancel_at_period_end,
      provider_event: event.id,
      provider_event_type: event.type,
      provider_event_at: new Date(event.created * 1000).toISOString(),
    });
    if (error) throw error;
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: "Subscription update failed. Retry delivery." },
      { status: 503 },
    );
  }
}
