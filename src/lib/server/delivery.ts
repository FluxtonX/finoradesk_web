import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { adminClient } from "./billing";
import { checked } from "./errors";
import {
  emailConfig,
  prepareEmail,
  submitResend,
  DeliveryError,
  type ResendPayload,
} from "@/lib/domain/delivery";
import { buildInvoicePdf } from "@/lib/domain/invoice-pdf";
import type { Invoice, InvoiceLine } from "@/lib/domain/types";
interface Delivery {
  id: string;
  provider: string;
  notification_job_id: string;
  organization_id: string;
  invoice_id: string;
  actor_id: string;
  kind: "invoice" | "reminder";
  recipient: string;
  lease_token: string;
  payload: ResendPayload | null;
  attempts: number;
  prepared_outstanding_cents: number | null;
}
export function secretMatches(
  actual: string | null,
  expected: string | undefined,
) {
  if (!expected || !actual) return false;
  const a = Buffer.from(actual),
    b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function deliveryEnabled() {
  try {
    return !!emailConfig(process.env);
  } catch {
    return false;
  }
}
export async function runDeliveryWorker() {
  const config = emailConfig(process.env);
  if (!config) throw new Error("Delivery is not configured.");
  const db = adminClient();
  checked(await db.rpc("run_due_web_reminders"));
  const jobs = checked(await db.rpc("claim_web_deliveries")) as Delivery[];
  const outcomes: string[] = [];
  for (const job of jobs) {
    outcomes.push(
      await (async () => {
        let dispatchStarted = false;
        async function finish(
          state: string,
          error: string | null,
          messageId?: string,
        ) {
          // SQL locks both rows: a callback racing the send response cannot regress.
          checked(
            await db.rpc("finish_web_resend_attempt", {
              target_delivery: job.id,
              worker_lease: job.lease_token,
              next_state: state,
              error_message: error,
              provider_message: messageId ?? null,
            }),
          );
          return state;
        }
        try {
          if (job.provider !== "resend")
            return finish(
              "needs_review",
              "This request belongs to the previous provider. Review before resending.",
            );
          const invoice = checked(
            await db
              .from("invoice_balances")
              .select("*")
              .eq("organization_id", job.organization_id)
              .eq("id", job.invoice_id)
              .single(),
          ) as Invoice;
          const member = checked(
            await db
              .from("organization_members")
              .select("role,active")
              .eq("organization_id", job.organization_id)
              .eq("user_id", job.actor_id)
              .single(),
          );
          const org = checked(
            await db
              .from("organizations")
              .select("active")
              .eq("id", job.organization_id)
              .single(),
          );
          if (
            !member?.active ||
            member.role === "viewer" ||
            !org?.active ||
            invoice.state !== "issued"
          )
            return finish(
              "cancelled",
              "Invoice or sender access is no longer eligible.",
            );
          if (job.kind === "reminder") {
            const schedule = checked(
              await db
                .from("web_reminder_schedules")
                .select("enabled,runs,opted_in")
                .eq("organization_id", job.organization_id)
                .eq("invoice_id", job.invoice_id)
                .maybeSingle(),
            );
            // runs=3 disables future generation but the final queued reminder remains eligible.
            if (
              invoice.derived_status !== "Overdue" ||
              !schedule ||
              !schedule.opted_in
            )
              return finish(
                "cancelled",
                "Reminder is no longer eligible or consent was withdrawn.",
              );
          }
          const suppressed = checked(
            await db
              .from("web_email_suppressions")
              .select("email")
              .eq("email", job.recipient)
              .maybeSingle(),
          );
          if (suppressed)
            return finish(
              "cancelled",
              "Recipient is suppressed after a delivery failure or complaint.",
            );
          if (
            config.mode === "test" &&
            !config.allowlist.includes(job.recipient)
          )
            return finish("failed", "Recipient is outside the test allowlist.");
          if (!job.payload) {
            const lines = checked(
              await db
                .from("invoice_items")
                .select("*")
                .eq("organization_id", job.organization_id)
                .eq("invoice_id", job.invoice_id)
                .order("position"),
            ) as InvoiceLine[];
            const pdf = await buildInvoicePdf(
              invoice,
              lines,
              await readFile(
                path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf"),
              ),
            );
            job.prepared_outstanding_cents = invoice.outstanding_cents;
            job.payload = prepareEmail(
              invoice,
              job.kind,
              job.id,
              Buffer.from(pdf).toString("base64"),
              config,
            );
            checked(
              await db
                .from("web_email_deliveries")
                .update({
                  payload: job.payload,
                  prepared_outstanding_cents: job.prepared_outstanding_cents,
                })
                .eq("id", job.id)
                .eq("lease_token", job.lease_token)
                .eq("state", "processing"),
            );
          }
          // Recheck amount and consent just before dispatch. No automatic retry after ambiguous acceptance.
          if (job.kind === "reminder") {
            const current = checked(
              await db
                .from("invoice_balances")
                .select("derived_status,outstanding_cents")
                .eq("organization_id", job.organization_id)
                .eq("id", job.invoice_id)
                .single(),
            );
            const schedule = checked(
              await db
                .from("web_reminder_schedules")
                .select("enabled,runs,opted_in")
                .eq("organization_id", job.organization_id)
                .eq("invoice_id", job.invoice_id)
                .single(),
            );
            if (
              current?.derived_status !== "Overdue" ||
              !schedule ||
              !schedule.opted_in
            )
              return finish(
                "cancelled",
                "Payment, invoice state or reminder consent changed.",
              );
            if (current.outstanding_cents !== job.prepared_outstanding_cents)
              return finish(
                "cancelled",
                "Balance changed during preparation. Review before requesting another reminder.",
              );
          }
          dispatchStarted = true;
          const messageId = await submitResend(
            job.payload,
            config.apiKey,
            job.id,
          );
          return finish("accepted", null, messageId);
        } catch (e) {
          if (e instanceof DeliveryError)
            return finish(
              e.outcome === "retry" && job.attempts < 4
                ? "queued"
                : e.outcome === "retry"
                  ? "failed"
                  : e.outcome,
              e.message,
            );
          return finish(
            dispatchStarted ? "needs_review" : "failed",
            dispatchStarted
              ? "Provider acceptance needs review."
              : "Could not prepare email. Review the invoice and delivery configuration.",
          );
        }
      })(),
    );
    // Keep below Resend’s default request rate; explicit 429s remain bounded retries.
    if (job !== jobs.at(-1))
      await new Promise((resolve) => setTimeout(resolve, 550));
  }
  return { claimed: jobs.length, outcomes };
}
