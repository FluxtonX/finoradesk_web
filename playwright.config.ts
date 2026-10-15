import { defineConfig, devices } from "@playwright/test";
const channel =
  process.env.PLAYWRIGHT_BROWSER_CHANNEL === "chromium" ? undefined : "chrome";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        channel,
      },
    },
  ],
  webServer: [
    {
      command: "node tests/fixtures/supabase-server.mjs",
      url: "http://127.0.0.1:54329/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_isolated_browser_fixture",
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
        STRIPE_SECRET_KEY: "",
        STRIPE_WEBHOOK_SECRET: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
      },
    },
  ],
});
