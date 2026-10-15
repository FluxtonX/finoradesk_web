"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWriter } from "./context";
import { checked, errorMessage } from "./errors";
import { uuid } from "@/lib/domain/validation";
import { deliveryEnabled } from "./delivery";
import type { ActionResult } from "@/lib/domain/types";
export async function queueWebDelivery(input: unknown): Promise<ActionResult> {
  try {
    const d = z
      .object({ id: uuid, key: uuid, kind: z.enum(["invoice", "reminder"]) })
      .parse(input);
    const { db, organization } = await requireWriter();
    if (!deliveryEnabled())
      throw new Error(
        "Email delivery is not connected yet. Download and share the PDF.",
      );
    const id = checked(
      await db.rpc("request_web_invoice_delivery", {
        org: organization.id,
        target_invoice: d.id,
        job_kind: d.kind,
        idempotency_key: d.key,
      }),
    );
    revalidatePath(`/workspace/invoices/${d.id}`);
    const job = checked(
      await db
        .from("web_email_deliveries")
        .select("state,last_error")
        .eq("organization_id", organization.id)
        .eq("id", id)
        .single(),
    );
    if (!job)
      throw new Error(
        "Could not confirm the email request. Refresh delivery history.",
      );
    const messages: Record<string, string> = {
      queued: "Email queued. Delivery will be confirmed separately.",
      processing: "This email is being prepared or submitted.",
      accepted:
        "The provider accepted this email. Delivery is not yet confirmed.",
      delivered: "This email has already been delivered.",
      failed:
        "This email request failed. Review delivery history before retrying.",
      needs_review: "Provider acceptance needs review before any resend.",
      cancelled: "This email request was cancelled.",
      bounced: "This email bounced. Review the recipient before retrying.",
      complained: "This recipient is suppressed after a complaint.",
    };
    return {
      ok: ["queued", "processing", "accepted", "delivered"].includes(job.state),
      message: messages[job.state] ?? "Review the current delivery history.",
      id: String(id),
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function setWebReminder(
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  try {
    uuid.parse(id);
    z.boolean().parse(enabled);
    const { db, organization } = await requireWriter();
    if (enabled && !deliveryEnabled())
      throw new Error(
        "Connect email delivery before enabling automatic reminders.",
      );
    const next = checked(
      await db.rpc("set_web_reminder", {
        org: organization.id,
        target_invoice: id,
        opt_in: enabled,
      }),
    );
    revalidatePath(`/workspace/invoices/${id}`);
    return {
      ok: true,
      message: enabled
        ? `Reminders enabled. Next scheduled time: ${new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: organization.timezone }).format(new Date(next))} (${organization.timezone}).`
        : "Automatic reminders disabled.",
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
