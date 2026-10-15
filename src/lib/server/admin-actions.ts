"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { workspaceContext, requireAdmin, userContext } from "./context";
import { checked, errorMessage } from "./errors";
import { uuid } from "@/lib/domain/validation";
import type { ActionResult } from "@/lib/domain/types";
export async function createTicket(input: unknown): Promise<ActionResult> {
  try {
    const data = z
      .object({
        subject: z.string().trim().min(1).max(160),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(input);
    const { db, organization } = await workspaceContext();
    const id = checked(
      await db.rpc("create_ticket", {
        org: organization.id,
        title: data.subject,
        message: data.body,
      }),
    ) as string;
    revalidatePath("/workspace/support");
    return { ok: true, message: "Support request saved.", id };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function replyTicket(input: unknown): Promise<ActionResult> {
  try {
    const data = z
      .object({ id: uuid, body: z.string().trim().min(1).max(4000) })
      .parse(input);
    const { db, organization, user } = await workspaceContext();
    const ticket = checked(
      await db
        .from("support_tickets")
        .select("id,status")
        .eq("organization_id", organization.id)
        .eq("id", data.id)
        .single(),
    );
    if (!ticket) throw new Error("Ticket unavailable.");
    if (ticket.status === "closed")
      throw new Error("This ticket is closed. Create a new request.");
    checked(
      await db
        .from("support_messages")
        .insert({
          organization_id: organization.id,
          ticket_id: data.id,
          body: data.body,
          created_by: user.id,
        })
        .select("id")
        .single(),
    );
    revalidatePath(`/workspace/support/${data.id}`);
    return { ok: true, message: "Reply saved." };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function requestDeletion(): Promise<ActionResult> {
  try {
    const { db, organization } = await requireAdmin();
    checked(
      await db.rpc("request_privacy_action", {
        org: organization.id,
        request_kind: "deletion",
      }),
    );
    revalidatePath("/workspace/settings");
    return {
      ok: true,
      message:
        "Deletion review requested. No records have been deleted; retention and ownership will be reviewed.",
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function updateProfile(input: unknown): Promise<ActionResult> {
  try {
    const data = z
      .object({ name: z.string().trim().max(120), reminders: z.boolean() })
      .parse(input);
    const { db, user } = await userContext();
    checked(
      await db
        .from("profiles")
        .upsert({
          id: user.id,
          display_name: data.name,
          notification_preferences: { reminders: data.reminders },
        })
        .select("id")
        .single(),
    );
    revalidatePath("/workspace/settings");
    return {
      ok: true,
      message:
        "Preferences saved. This does not activate invoice email delivery.",
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function platformTicket(input: unknown): Promise<ActionResult> {
  try {
    const data = z
      .object({
        id: uuid,
        status: z.enum(["open", "pending", "closed"]),
        body: z.string().max(4000),
      })
      .parse(input);
    const { db } = await workspaceContext();
    const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2")
      throw new Error("MFA verification is required.");
    checked(
      await db.rpc("platform_ticket_action", {
        target_ticket: data.id,
        new_status: data.status,
        response_text: data.body || null,
      }),
    );
    revalidatePath("/workspace/platform");
    return { ok: true, message: "Support action saved." };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
