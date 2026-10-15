"use server";
import { z } from "zod";
import { requireAdmin } from "./context";
import { checked, errorMessage } from "./errors";
import {
  stripeClient,
  adminClient,
  billingConfigured,
  siteUrl,
  type WebBilling,
} from "./billing";
import { planChangePortal } from "./plan-change";
import { pilotPlans } from "@/lib/domain/plans";
import { uuid } from "@/lib/domain/validation";
import type { ActionResult } from "@/lib/domain/types";
export async function checkout(input: unknown): Promise<ActionResult> {
  try {
    const data = z
      .object({ plan: z.enum(["starter", "growth", "business"]), key: uuid })
      .parse(input);
    const { organization, user } = await requireAdmin();
    if (!billingConfigured())
      throw new Error("Billing is not connected yet. No payment was started.");
    const stripe = stripeClient(),
      server = adminClient(),
      origin = siteUrl();
    const current = checked(
      await server
        .from("web_billing_profiles")
        .select("*")
        .eq("organization_id", organization.id)
        .maybeSingle(),
    ) as WebBilling | null;
    const plan = pilotPlans(process.env).find((p) => p.id === data.plan)!;
    const members = await server
      .from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("active", true);
    if (members.error) throw new Error("Could not verify team size.");
    if ((members.count ?? 0) > plan.seats)
      throw new Error(
        `This plan supports ${plan.seats} active user${plan.seats === 1 ? "" : "s"}. Choose a larger plan or review team access.`,
      );
    const tax = process.env.BILLING_TAX_MODE;
    if (!["inclusive", "exclusive"].includes(tax ?? ""))
      throw new Error(
        "Subscription tax settings need confirmation before checkout.",
      );
    if (current?.stripe_subscription_id) {
      if (["active", "trialing"].includes(current.status)) {
        if (current.plan_id === data.plan)
          throw new Error("This business is already on that plan.");
        const portal = await planChangePortal(
          stripe,
          current.stripe_customer_id,
          current.stripe_subscription_id,
          plan,
          origin,
          tax as "inclusive" | "exclusive",
        );
        return {
          ok: true,
          message:
            "Review the plan change and any proration in secure billing.",
          url: portal.url,
        };
      }
      throw new Error(
        "Review the existing subscription in Manage billing before changing plans.",
      );
    }
    const requestKey = checked(
      await server.rpc("claim_web_checkout", {
        org: organization.id,
        request_key: data.key,
        requested_plan: data.plan,
      }),
    ) as string;
    const reservation = checked(
      await server
        .from("web_checkout_locks")
        .select("expires_at")
        .eq("organization_id", organization.id)
        .eq("request_id", requestKey)
        .single(),
    );
    if (!reservation)
      throw new Error("Could not reserve checkout. Please retry.");
    const previous = checked(
      await server
        .from("web_checkout_sessions")
        .select("stripe_checkout_id")
        .eq("organization_id", organization.id)
        .eq("request_id", requestKey)
        .maybeSingle(),
    );
    if (previous) {
      const resumed = await stripe.checkout.sessions.retrieve(
        previous.stripe_checkout_id,
      );
      if (resumed.status === "open" && resumed.url)
        return {
          ok: true,
          message: "Continue your existing checkout.",
          url: resumed.url,
        };
      if (resumed.status === "complete")
        throw new Error(
          "Subscription confirmation is synchronising. Refresh shortly.",
        );
    }
    const customer =
      current?.stripe_customer_id ??
      (
        await stripe.customers.create(
          {
            email: user.email,
            name: organization.name,
            metadata: { organization_id: organization.id },
          },
          { idempotencyKey: `finoredesk-customer:${organization.id}` },
        )
      ).id;
    if (!current)
      checked(
        await server
          .from("web_billing_profiles")
          .upsert(
            { organization_id: organization.id, stripe_customer_id: customer },
            { onConflict: "organization_id", ignoreDuplicates: true },
          ),
      );
    const existingSubscriptions = await stripe.subscriptions.list({
      customer,
      status: "all",
      limit: 100,
    });
    if (
      existingSubscriptions.data.some((s) =>
        ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(
          s.status,
        ),
      )
    )
      throw new Error(
        "An existing subscription is still synchronising. Use billing management or contact support.",
      );
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        adaptive_pricing: { enabled: false },
        expires_at: Math.floor(Date.parse(reservation.expires_at) / 1000),
        payment_method_types: ["card"],
        customer,
        client_reference_id: organization.id,
        success_url: `${origin}/workspace/billing?checkout=returned&plan=${plan.id}`,
        cancel_url: `${origin}/workspace/billing?checkout=cancelled`,
        line_items: [
          {
            price_data: {
              currency: "aud",
              unit_amount: plan.cents,
              recurring: { interval: "month" },
              product_data: {
                name: `Finoredesk ${plan.name}`,
                metadata: { finoredesk_plan: plan.id },
              },
              tax_behavior: tax as "inclusive" | "exclusive",
            },
            quantity: 1,
          },
        ],
        automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === "true" },
        metadata: {
          organization_id: organization.id,
          plan_id: plan.id,
          actor_id: user.id,
        },
        subscription_data: {
          metadata: {
            application: "finoredesk",
            organization_id: organization.id,
            plan_id: plan.id,
          },
          ...(!process.env.STRIPE_GST_TAX_RATE_ID ||
          process.env.STRIPE_AUTOMATIC_TAX === "true"
            ? {}
            : { default_tax_rates: [process.env.STRIPE_GST_TAX_RATE_ID] }),
        },
        customer_update: { address: "auto" },
      },
      {
        idempotencyKey: `finoredesk-checkout:${organization.id}:${data.plan}:${requestKey}`,
      },
    );
    checked(
      await server.from("web_checkout_sessions").upsert(
        {
          request_id: requestKey,
          organization_id: organization.id,
          actor_id: user.id,
          plan_id: data.plan,
          stripe_checkout_id: session.id,
        },
        { onConflict: "request_id", ignoreDuplicates: true },
      ),
    );
    if (!session.url)
      throw new Error("Checkout unavailable. Retry this request.");
    return {
      ok: true,
      message: "Continue to secure checkout.",
      url: session.url,
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function billingPortal(): Promise<ActionResult> {
  try {
    const { organization } = await requireAdmin();
    if (!billingConfigured()) throw new Error("Billing is not connected yet.");
    const server = adminClient(),
      current = checked(
        await server
          .from("web_billing_profiles")
          .select("stripe_customer_id")
          .eq("organization_id", organization.id)
          .single(),
      );
    if (!current) throw new Error("No billing account is linked.");
    const session = await stripeClient().billingPortal.sessions.create({
      customer: current.stripe_customer_id,
      configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID,
      return_url: `${siteUrl()}/workspace/billing`,
    });
    return {
      ok: true,
      message: "Opening billing management.",
      url: session.url,
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
