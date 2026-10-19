# Stripe subscriptions

Finoredesk uses Stripe-hosted Checkout and the customer portal for subscriptions
to the web application. This does not collect payments for customers' invoices.
The configured environment is Stripe test mode; live billing remains disabled.

Test integration and controlled hosted acceptance were completed on 16 October 2026. Results cover checkout/declines, inclusive GST/AUD, verified activation,
confirmed upgrades, cancellation, retained read/export access, webhook replay
and signature checks, and protection of billing state.

## Current settings

- AUD monthly prices: Starter A$19, Growth A$49, Business A$99.
- Prices include GST. The test setup uses an inclusive 10% test tax rate.
- Checkout adaptive pricing is disabled so these subscriptions stay in AUD.
- A confirmed active/trial subscription allows financial changes; viewing,
  exports and support remain available after subscription access ends.
- Cancellation through the portal is scheduled for the period end. Access
  continues until that period ends, subject to the provider's subscription state.
- Billing cards highlight the current active/trial plan and disable its button.
  Other plans offer upgrade or downgrade according to the plan tier, with Stripe
  confirmation and the existing server-side team-capacity check. Scheduled
  cancellation keeps the current-plan marker until access expires. Subscriptions
  needing review open billing management rather than another checkout.
- Plan changes use a Stripe confirmation screen. Only the server-selected plan
  is available in that confirmation session; the general portal cannot switch
  plans around the app's team-capacity check. Stripe previews proration; approved
  changes create prorations for the next invoice.
- A fully ended subscription currently requires support review before a new
  subscription is linked. This prevents silently creating duplicate subscriptions.

## Server configuration

Keep these private, without a `NEXT_PUBLIC_` prefix:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SUPABASE_SERVICE_ROLE_KEY
STRIPE_PORTAL_CONFIGURATION_ID
STRIPE_GST_TAX_RATE_ID
BILLING_TAX_MODE=inclusive
BILLING_LIVE_ENABLED=false
STRIPE_AUTOMATIC_TAX=false
```

`SUPABASE_SERVICE_ROLE_KEY` accepts a current Supabase server secret key despite
the legacy variable name. Never commit `.env.local`, copy it to a client bundle
or print credentials in test output. Vercel's Production environment stores the
server keys as sensitive settings. Development/preview billing is separate.

For an explicitly authorised test-account setup:

```sh
npm run stripe:setup:test
```

The script requires a test key, creates/reuses app-scoped settings and saves the
signing secret locally without printing it. It does not alter unrelated Stripe
webhooks or enable live keys. Nothing runs during application startup/build.
Changing Vercel environment settings requires a new deployment.

## Webhook and database

Webhook endpoint:
`https://finoredesk-web.vercel.app/api/billing/webhook`

Events: `customer.subscription.created`, `updated`, `deleted`, `paused`, `resumed`.
Signature verification precedes processing. The handler retrieves current Stripe
state, validates the business/customer relationship, ignores unrelated apps on
the shared account and uses the database event ledger to deduplicate deliveries.
A successful browser redirect grants no subscription access by itself.

The separate backend workspace owns migration
`202610150012_web_billing.sql`. It was explicitly applied to hosted Supabase on
16 October 2026 after checking that the billing schema was absent. No reset or
startup migration is used. Reconcile SQL-editor/Management-API changes with CLI
migration history before any future `db push`.

## Controlled acceptance

Use a dedicated test business and Stripe's
[test cards](https://docs.stripe.com/testing). For successful Checkout, use
`4242 4242 4242 4242`, a future expiry, CVC `123` and an Australian billing country.
No real money is charged in this environment.

The opt-in hosted harness is under `tests/integration/stripe-hosted.mjs`. It
creates its own Supabase test account/business, enrols actual MFA and exercises
the deployed app with Stripe test mode. Generated fixture credentials are kept
only in a private temporary file outside this repository, not browser traces or
test reports. Ordinary `npm test` never runs hosted writes.

```sh
RUN_HOSTED_STRIPE_TEST=true node tests/integration/stripe-hosted.mjs pay
RUN_HOSTED_STRIPE_TEST=true node tests/integration/stripe-hosted.mjs change
RUN_HOSTED_STRIPE_TEST=true node tests/integration/stripe-hosted.mjs portal
RUN_HOSTED_STRIPE_TEST=true node tests/integration/stripe-hosted.mjs webhooks
RUN_HOSTED_STRIPE_TEST=true node tests/integration/stripe-hosted.mjs permissions
RUN_HOSTED_STRIPE_TEST=true node tests/integration/stripe-hosted.mjs cancel
RUN_HOSTED_STRIPE_TEST=true node tests/integration/stripe-hosted.mjs cleanup
```

Run these sequentially because they share a controlled fixture and authenticator.
The cancellation check ends that fixture's test subscription. Cleanup disables
the dedicated test business/account, removes temporary credentials and writes a
sanitised result to ignored `test-results/stripe-acceptance.json`. This acceptance
does not establish production tax registration, account activation or real-card
processing. The live account's activation, tax setup, branding and commercial
terms must be confirmed before deliberately enabling live billing.
