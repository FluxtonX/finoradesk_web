import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
vi.mock("server-only", () => ({}));
import { planChangePortal } from "./plan-change";
import { pilotPlans } from "../domain/plans";
describe("confirmed subscription plan changes", () => {
  it("opens provider confirmation with a new price instead of directly charging", async () => {
    const sessions = vi.fn(
      async (_input: Stripe.BillingPortal.SessionCreateParams) => ({
        url: "https://billing.stripe.com/test-confirm",
      }),
    );
    const provider = {
      subscriptions: {
        retrieve: vi.fn(async () => ({ items: { data: [{ id: "si_test" }] } })),
      },
      products: { create: vi.fn(async () => ({ id: "prod_test" })) },
      prices: { create: vi.fn(async () => ({ id: "price_test" })) },
      billingPortal: {
        configurations: { create: vi.fn(async () => ({ id: "bpc_confirm" })) },
        sessions: { create: sessions },
      },
    };
    const result = await planChangePortal(
      provider as unknown as Stripe,
      "cus_test",
      "sub_test",
      pilotPlans()[1],
      "https://example.test",
      "inclusive",
    );
    expect(result.url).toContain("billing.stripe.com");
    expect(sessions.mock.calls[0][0]).toMatchObject({
      configuration: "bpc_confirm",
      flow_data: {
        type: "subscription_update_confirm",
        subscription_update_confirm: {
          subscription: "sub_test",
          items: [{ id: "si_test", price: "price_test", quantity: 1 }],
        },
      },
    });
    expect(provider.billingPortal.configurations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        features: expect.objectContaining({
          subscription_update: expect.objectContaining({
            products: [{ product: "prod_test", prices: ["price_test"] }],
          }),
        }),
      }),
      expect.anything(),
    );
  });
  it("requires review for subscriptions with multiple line items", async () => {
    const provider = {
      subscriptions: {
        retrieve: vi.fn(async () => ({
          items: { data: [{ id: "first" }, { id: "second" }] },
        })),
      },
    };
    await expect(
      planChangePortal(
        provider as unknown as Stripe,
        "cus_test",
        "sub_test",
        pilotPlans()[1],
        "https://example.test",
        "inclusive",
      ),
    ).rejects.toThrow("reviewed plan change");
  });
});
