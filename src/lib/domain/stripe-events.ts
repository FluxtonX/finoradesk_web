import Stripe from "stripe";
import { z } from "zod";
export function verifyStripeEvent(
  body: string,
  signature: string,
  secret: string,
) {
  return new Stripe(
    "sk_test_signature_verification_only",
  ).webhooks.constructEvent(body, signature, secret);
}
export function subscriptionMetadata(value: unknown) {
  return z
    .object({
      organization_id: z.uuid(),
      plan_id: z.enum(["starter", "growth", "business"]),
    })
    .parse(value);
}
export function eventIsSubscription(event: Stripe.Event) {
  return [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
  ].includes(event.type);
}

export function cancellationScheduled(
  subscription: Pick<
    Stripe.Subscription,
    "status" | "cancel_at_period_end" | "cancel_at"
  >,
) {
  return (
    subscription.status !== "canceled" &&
    (subscription.cancel_at_period_end ||
      typeof subscription.cancel_at === "number")
  );
}
