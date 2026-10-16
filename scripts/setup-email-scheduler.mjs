import nextEnv from "@next/env";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
nextEnv.loadEnvConfig(process.cwd());
const root = fileURLToPath(new URL("../../", import.meta.url));
const origin = new URL(process.argv[2] ?? "https://finoredesk-web.vercel.app")
  .origin;
const worker = `${origin}/api/jobs/invoice-delivery`;
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
let directory;
try {
  if (
    !origin.startsWith("https://") ||
    !process.env.CRON_SECRET ||
    process.env.EMAIL_MODE !== "test"
  )
    throw new Error("Complete test email configuration first.");
  const response = await fetch(worker, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new Error(
      "Deploy configured email worker and migrations before enabling its schedule.",
    );
  directory = await mkdtemp(path.join(tmpdir(), "finoredesk-email-scheduler-"));
  const file = path.join(directory, "setup.sql");
  await writeFile(
    file,
    `begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $setup$
declare secret_id uuid;
begin
  select id into secret_id from vault.secrets where name='finoredesk_web_worker_url';
  if secret_id is null then perform vault.create_secret(${quote(worker)},'finoredesk_web_worker_url');
  else perform vault.update_secret(secret_id,${quote(worker)});end if;
  select id into secret_id from vault.secrets where name='finoredesk_web_worker_token';
  if secret_id is null then perform vault.create_secret(${quote(process.env.CRON_SECRET)},'finoredesk_web_worker_token');
  else perform vault.update_secret(secret_id,${quote(process.env.CRON_SECRET)});end if;
end;$setup$;
select cron.schedule('finoredesk-web-invoice-delivery','*/5 * * * *',$job$
select net.http_post(
url := (select decrypted_secret from vault.decrypted_secrets where name='finoredesk_web_worker_url'),
headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='finoredesk_web_worker_token')),
body := '{}'::jsonb,timeout_milliseconds := 55000);
$job$);
commit;
select jobid,jobname,schedule,active from cron.job where jobname='finoredesk-web-invoice-delivery';`,
    { mode: 0o600 },
  );
  const output = execFileSync(
    "supabase",
    ["db", "query", "--linked", "--file", file, "--output", "json", "--yes"],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"], timeout: 120000 },
  ).toString();
  const result = JSON.parse(output.slice(output.indexOf("{")));
  console.log(
    JSON.stringify({
      scheduler: result.rows,
      worker,
      secrets: "Worker token stored only in Vault and server environment.",
    }),
  );
} catch (error) {
  console.error(
    error instanceof Error && !error.message.includes("Command failed")
      ? error.message
      : "Scheduler setup failed. Review extension permissions; no secrets printed.",
  );
  process.exitCode = 1;
} finally {
  if (directory) await rm(directory, { recursive: true, force: true });
}
