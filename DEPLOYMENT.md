# Vercel deployment

This repository is the standalone Next.js application. Connect
`FluxtonX/finoradesk_web` to Vercel using its native GitHub integration.

## Project settings

| Setting           | Value                              |
| ----------------- | ---------------------------------- |
| Framework         | Next.js                            |
| Root directory    | `.` (leave empty in the dashboard) |
| Production branch | `main`                             |
| Node.js           | `22.x`                             |
| Install command   | `npm ci`                           |
| Build command     | `npm run build`                    |
| Output directory  | Next.js default; do not override   |

Import the repository once at https://vercel.com/new. If it is not listed,
grant the Vercel GitHub App access to this repository. Keep automatic Git
deployments enabled and select `main` for the Production environment's branch
tracking. Pushes/merges to `main` then build and deploy to the stable production
domain; other branches normally create previews. A CLI deployment alone does
not establish automatic Git deployment.

No GitHub Actions deployment token or separate deployment workflow is required.
The parent workspace's `.github/` directory is outside this standalone repository.

## Required environment variables

Add these in Vercel before the first production build:

```text
NEXT_PUBLIC_SUPABASE_URL=<existing hosted project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<existing public publishable key>
NEXT_PUBLIC_SITE_URL=https://<your stable production domain>
EMAIL_MODE=disabled
BILLING_LIVE_ENABLED=false
```

The public Supabase settings are in the local ignored `.env.local`; they are not
committed. Vercel does not receive that file from GitHub. Use the stable project
`.vercel.app` domain until a custom domain is available. Redeploy after changing
environment settings, especially `NEXT_PUBLIC_` values baked into client bundles.
Do not add provider secrets with a `NEXT_PUBLIC_` prefix.

Leave optional provider credentials unset until those integrations are ready.
Stripe is not required to publish the current controlled pilot. Configuring
Stripe and its tax settings enables subscription checks for financial writes.
`BILLING_LIVE_ENABLED=false` blocks live Stripe keys; it does not disable test
subscriptions. The AI provider is configured in the existing Supabase Edge
Function, rather than by adding its private key to a public web variable.

If branch previews are needed, configure their environment variables deliberately;
they perform real operations against whichever Supabase project you select.

## Hosted Supabase

In Authentication → URL Configuration, add the exact production callback:

```text
https://<your stable production domain>/auth/callback
https://<your stable production domain>/auth/callback?next=/auth/password
https://<your stable production domain>/auth/callback?next=/onboarding
```

Keep the existing mobile and localhost callbacks. Do not replace the shared Site
URL or email templates without checking their existing consumers. Verify signup,
resend and password-reset links from the deployed browser. Owner/admin access
requires authenticator MFA.

Password recovery also requires the account's existing authenticator when MFA is
enabled. The reset page sends an AAL1 recovery session to the MFA challenge and
returns to the password form after verification. Test this in the same browser
profile that requested the email. Sessions already at AAL2 and accounts without
MFA can update directly. No MFA policy change or migration is needed.

Core invoice issuing works with the existing invoice RPC before the optional
review module is installed. If the approval-aware RPC is missing, the app first
checks the approval policy and uses the core issuer only when approval is not
required. Permission, policy and other issuing errors remain blocking. Advanced
reviews/approval workflows still require migration 015 from the backend workspace;
the app never applies it during startup or invoice issue.

Review migration history and apply only missing compatible migrations through
the separate backend workspace. Do not reset data or run migrations as a Vercel
install/build command. This standalone web repository does not contain the
parent workspace's `supabase/` migrations. Local SQL tests require that workspace;
the production build does not.

## Provider activation later

- Stripe callback: `https://<domain>/api/billing/webhook`; use the endpoint's
  signing secret and start in test mode.
- Resend callback: `https://<domain>/api/email/webhook`; configure the sender,
  controlled test inboxes and `RESEND_WEBHOOK_SECRET` for signed Svix callbacks.
  Follow [EMAIL.md](EMAIL.md) for explicit setup and acceptance.
- Reminder worker: `POST https://<domain>/api/jobs/invoice-delivery` with
  `Authorization: Bearer <CRON_SECRET>`. Its Node.js route allows 60 seconds.
  Use the hosted Supabase scheduler described in the backend workspace guide.
  Do not add a Vercel GET cron to the existing POST-only route.
- Deployment protection must allow intended users and authenticated provider/
  scheduler requests to reach their routes; confirm it before provider testing.

## Acceptance

1. Confirm the Vercel deployment is Ready and the Git integration is connected.
2. Open `/` and `/auth`; `/workspace` should redirect signed-out visitors.
3. Test a controlled account: sign-in/MFA, business switching, contact save,
   invoice/PDF/payment, receipt upload and reports.
4. Push a real reviewed commit to `main`. Verify a new Git-sourced Production
   deployment references that commit and the stable domain serves it.
5. If a build fails, fix its logs and push again; inspect which deployment the
   stable alias is serving rather than assuming the failed change is live.

References: [Vercel Git deployments](https://vercel.com/docs/git),
[project configuration](https://vercel.com/docs/project-configuration/vercel-json).
