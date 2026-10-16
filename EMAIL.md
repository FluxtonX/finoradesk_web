# Resend invoice emails and reminders

Resend replaces Brevo for the web app. This integration sends issued invoice
PDFs and opted-in reminders. Supabase Auth emails use separate configuration.

## Test setup

Add the original private key to ignored `.env.local`:

```dotenv
RESEND_API_KEY=re_your_original_key
EMAIL_TEST_RECIPIENTS=your-controlled-account-inbox@example.com
EMAIL_FROM=onboarding@resend.dev
EMAIL_FROM_NAME=Finoredesk
EMAIL_REPLY_TO=your-controlled-account-inbox@example.com
```

The development sender can send to the Resend account's inbox. For customer
recipients, verify a domain and choose a sender on that domain first. Test mode
also enforces Finoredesk's recipient allowlist; it never rewrites a customer's
address. These are real test emails, not simulated inbox delivery.

Run explicitly, from this repository:

```sh
npm run email:setup:test
```

This creates/reuses only this application's webhook, saves its signing secret,
sets `EMAIL_MODE=test` and generates a separate worker token. It does not send
an invoice, change other applications' webhooks or modify shared Auth SMTP.
Do not paste any private keys into chat or commit `.env.local`.

The parent backend workspace must explicitly apply compatible migrations 013,
016 and 017 after checking hosted schema. Never migrate during startup/build. Old
Brevo payloads are quarantined for review rather than sent through Resend.

Configure the matching server variables in Vercel Production. An authenticated
CLI helper is available for the existing Finoredesk project:

```sh
npm run email:sync:vercel
```

The helper changes only email/server variables in Production, never Preview.
It does not deploy code. Deploy the reviewed version, then run from the full
workspace (requires the linked Supabase CLI):

```sh
npm run email:setup:scheduler
```

The scheduler helper first checks the authenticated deployed worker, then
explicitly enables managed pg_cron/pg_net, stores the URL/token in Vault and
creates/updates the named job `finoredesk-web-invoice-delivery` every five
minutes. It leaves other jobs unchanged. It never runs Docker or resets data.

## Acceptance

1. Use a dedicated test business with eligible test billing and a customer
   addressed to the controlled test inbox.
2. Create and issue an invoice, download its saved PDF, review the email, and
   choose **Queue invoice email**. Wait for the next scheduled worker run.
3. Verify `accepted` separately from `delivered`, then check the inbox and PDF.
   Provider `delivered` means the recipient mail server accepted it; it does
   not prove inbox placement or that a person opened the attachment.
4. Enable reminders on a dedicated overdue invoice. Verify first due date at
   09:00 business time, weekly continuation, maximum three, payment/void stops
   and disabling consent. Never change real invoice dates to accelerate tests.
5. Reject forged callbacks/worker tokens; replay a genuine event without
   duplicating state. Check bounce/complaint suppression using provider test
   addresses only in a deliberately configured acceptance environment.
6. Monitor `cron.job_run_details` **and** `net._http_response`; Cron success
   alone does not establish a successful HTTP request or email delivery.

The worker is `POST /api/jobs/invoice-delivery`, authenticated with
`Authorization: Bearer <CRON_SECRET>`. Do not configure a Vercel GET cron.
Callbacks reach `/api/email/webhook` and use Resend's Svix headers with
`RESEND_WEBHOOK_SECRET`. No bearer callback secret is used.

Invoice opt-in policy: one day overdue, weekly afterwards, maximum three at
09:00 in the business timezone. Polling may dispatch shortly after 09:00.
Payment/void/access/consent and suppression are rechecked before dispatch.
Provider acceptance can race a simultaneous database update; a submitted
email cannot be recalled. Ambiguous sends/expired leases require review,
never blind retries. Provider idempotency lasts 24 hours; it does not justify
replaying an old quarantined job.

## Launch and rollback

Before branded customer delivery: verified sending domain/DNS, a working
reply-to inbox, provider limits and privacy/retention review, actual inbox/PDF
acceptance and scheduler monitoring. Change `EMAIL_MODE=live` only after those
checks; the app refuses `resend.dev` as a live sender.

To pause: set `EMAIL_MODE=disabled`, redeploy and disable the named Cron job.
Retain queue/audit history. Do not reset data or resend old requests blindly.

References: [sending API](https://resend.com/docs/api-reference/emails/send-email),
[signed callbacks](https://resend.com/docs/webhooks/verify-webhooks-requests),
[test events](https://resend.com/docs/dashboard/emails/send-test-emails),
[Supabase scheduling/Vault](https://supabase.com/docs/guides/functions/schedule-functions).
