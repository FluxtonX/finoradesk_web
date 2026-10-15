# Finoredesk web

Independent Next.js project. The Flutter app is frozen.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Copy `.env.example` to ignored `.env.local` on a fresh checkout; this workspace already has public Supabase configuration. Keep provider/service-role keys server-only.

See [hosted setup](../docs/web_setup.md), [current scope](../project.md), [web status](../docs/web_implementation_status.md) and [pilot checklist](../docs/web_pilot_checklist.md).

For this standalone GitHub repository, follow [Vercel deployment](DEPLOYMENT.md).
Connect its native Git integration to deploy automatically from `main`; the
Vercel root directory is `.` because this repository already contains the app.

See [Stripe subscriptions](STRIPE.md) for test billing, hosted acceptance and the
separate live-activation requirements.

```sh
npm run format:check
npm run typecheck
npm test
npm run build
npm run test:browser
```

Browser tests use installed Chrome by default. To use Playwright's Chromium, install it with `npx playwright install chromium` and set `PLAYWRIGHT_BROWSER_CHANNEL=chromium`. The isolated HTTP fixture and PostgreSQL tests require no Docker and never use live customer/provider data. Fixtures live only under `tests/` or test modules.

PDFs embed Noto Sans under its bundled licence in `assets/fonts/OFL.txt`. UI fonts ship through Fontsource packages; rendering does not depend on a runtime Google Fonts request.
