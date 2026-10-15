"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { userContext, workspaceContext, requireAdmin } from "./context";
import { errorMessage, checked } from "./errors";
import { uuid, validAbn } from "@/lib/domain/validation";
import type { ActionResult } from "@/lib/domain/types";

export async function createBusiness(input: unknown): Promise<ActionResult> {
  try {
    const data = z
      .object({
        name: z.string().trim().min(1).max(160),
        abn: z.string().refine(validAbn, "Check your ABN."),
        address: z.string().max(2000),
        timezone: z.enum([
          "Australia/Sydney",
          "Australia/Melbourne",
          "Australia/Brisbane",
          "Australia/Adelaide",
          "Australia/Perth",
          "Australia/Darwin",
          "Australia/Hobart",
        ]),
        gst: z.boolean(),
      })
      .parse(input);
    const { db } = await userContext();
    const id = checked(
      await db.rpc("create_organization", {
        business_name: data.name,
        business_abn: data.abn || null,
        gst: data.gst,
        business_address: data.address,
        business_timezone: data.timezone,
      }),
    ) as string;
    (await cookies()).set("finoredesk-organization", id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 31536000,
    });
    revalidatePath("/workspace", "layout");
    return { ok: true, message: "Business created.", id };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function selectBusiness(id: string): Promise<ActionResult> {
  try {
    uuid.parse(id);
    const { db, user } = await userContext();
    const member = checked(
      await db
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("organization_id", id)
        .eq("active", true)
        .single(),
    );
    if (!member) throw new Error("Business access unavailable.");
    (await cookies()).set("finoredesk-organization", id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 31536000,
    });
    revalidatePath("/workspace", "layout");
    return { ok: true, message: "Business selected." };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function inviteMember(input: unknown): Promise<ActionResult> {
  try {
    const data = z
      .object({ email: z.email(), role: z.enum(["admin", "member", "viewer"]) })
      .parse(input);
    const { db, organization } = await requireAdmin();
    const token = checked(
      await db.rpc(
        process.env.STRIPE_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY
          ? "web_invite_member"
          : "invite_member",
        {
          org: organization.id,
          invite_email: data.email,
          invite_role: data.role,
        },
      ),
    );
    return {
      ok: true,
      message: "Invitation created. Share the invitation link securely.",
      url: `/onboarding?invite=${token}`,
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function acceptInvite(token: string): Promise<ActionResult> {
  try {
    uuid.parse(token);
    const { db } = await userContext();
    const id = checked(
      await db.rpc(
        process.env.STRIPE_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY
          ? "web_accept_invitation"
          : "accept_invitation",
        { invite_token: token },
      ),
    ) as string;
    (await cookies()).set("finoredesk-organization", id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 31536000,
    });
    revalidatePath("/workspace", "layout");
    return { ok: true, message: "Invitation accepted.", id };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function updateMember(input: unknown): Promise<ActionResult> {
  try {
    const data = z
      .object({
        user: uuid,
        role: z.enum(["admin", "member", "viewer"]),
        active: z.boolean(),
      })
      .parse(input);
    const { db, organization } = await requireAdmin();
    checked(
      await db.rpc(
        process.env.STRIPE_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY
          ? "web_set_member_role"
          : "set_member_role",
        {
          org: organization.id,
          target_user: data.user,
          new_role: data.role,
          is_active: data.active,
        },
      ),
    );
    revalidatePath("/workspace/settings");
    return { ok: true, message: "Member updated." };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function signOut() {
  const { db } = await userContext();
  const { error } = await db.auth.signOut();
  if (error)
    throw new Error("Could not sign out. Check your connection and retry.");
  (await cookies()).delete("finoredesk-organization");
  return { ok: true, message: "Signed out." };
}
export async function updateBusiness(input: unknown): Promise<ActionResult> {
  try {
    const data = z
      .object({
        name: z.string().trim().min(1).max(160),
        address: z.string().max(2000),
        reporting_basis: z.enum(["cash", "accrual"]),
      })
      .parse(input);
    const { db, organization } = await requireAdmin();
    checked(
      await db
        .from("organizations")
        .update(data)
        .eq("id", organization.id)
        .select("id")
        .single(),
    );
    revalidatePath("/workspace", "layout");
    return { ok: true, message: "Business updated." };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
