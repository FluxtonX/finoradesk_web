import { describe, it, expect } from "vitest";
import Stripe from "stripe";
import {
  verifyStripeEvent,
  subscriptionMetadata,
  eventIsSubscription,
} from "./stripe-events";
import { pilotPlans } from "./plans";
describe("provider boundary", () => {
  const secret = "whsec_test_fixture_only",
    stripe = new Stripe("sk_test_fixture_only");
  const body = JSON.stringify({
    id: "evt_test",
    object: "event",
    type: "customer.subscription.updated",
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: "sub_test" } },
  });
  it("accepts a correctly signed payload", () => {
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret,
    });
    expect(
      eventIsSubscription(verifyStripeEvent(body, signature, secret)),
    ).toBe(true);
  });
  it("rejects forged or changed webhook bodies", () => {
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret,
    });
    expect(() => verifyStripeEvent(body + " ", signature, secret)).toThrow();
    expect(() => verifyStripeEvent(body, "forged", secret)).toThrow();
  });
  it("rejects expired signatures", () => {
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret,
      timestamp: 1,
    });
    expect(() => verifyStripeEvent(body, signature, secret)).toThrow();
  });
  it("validates server metadata and ignores unsupported event types", () => {
    expect(() =>
      subscriptionMetadata({ organization_id: "evil", plan_id: "business" }),
    ).toThrow();
    expect(
      eventIsSubscription({ type: "customer.created" } as Stripe.Event),
    ).toBe(false);
  });
  it("uses editable bounded pilot prices", () => {
    expect(pilotPlans({ PILOT_STARTER_CENTS: "2500" })[0].cents).toBe(2500);
    expect(pilotPlans({ PILOT_STARTER_CENTS: "NaN" })[0].cents).toBe(1900);
    expect(pilotPlans({ PILOT_STARTER_CENTS: "-1" })[0].cents).toBe(1900);
  });
});
