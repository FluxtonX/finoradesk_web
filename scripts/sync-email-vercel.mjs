import nextEnv from "@next/env";
import { execFileSync } from "node:child_process";
nextEnv.loadEnvConfig(process.cwd());
const required = [
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "EMAIL_MODE",
  "EMAIL_FROM",
  "EMAIL_FROM_NAME",
  "EMAIL_REPLY_TO",
  "EMAIL_TEST_RECIPIENTS",
  "CRON_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const team = process.argv[2] ?? "muhammad-nasirs-projects-29cd2888";
try {
  if (
    process.env.EMAIL_MODE !== "test" ||
    required.some((key) => !process.env[key])
  )
    throw new Error(
      "Complete email:setup:test before syncing server settings.",
    );
  for (const key of required) {
    execFileSync(
      "vercel",
      [
        "api",
        "/v10/projects/finoredesk-web/env?upsert=true",
        "--scope",
        team,
        "--method",
        "POST",
        "--input",
        "-",
        "--raw",
      ],
      {
        input: JSON.stringify({
          key,
          value: process.env[key],
          type: "sensitive",
          target: ["production"],
        }),
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30000,
      },
    );
    console.log(`Configured production ${key}`);
  }
  console.log(
    "Redeploy the reviewed application before setting up the scheduler. Preview environments were not changed.",
  );
} catch {
  console.error(
    "Email environment sync incomplete. Check local settings and Vercel authentication; secrets were not printed.",
  );
  process.exitCode = 1;
}
