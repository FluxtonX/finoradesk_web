import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import type { Membership, Organization, Role } from "@/lib/domain/types";

export const userContext = cache(async () => {
  const db = await serverClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect("/auth?mode=signin");
  if (!user.email_confirmed_at) redirect("/auth?mode=verify");
  return { db, user };
});

export const workspaceContext = cache(async () => {
  const { db, user } = await userContext();
  const { data, error } = await db
    .from("organization_members")
    .select("role,organizations!inner(*)")
    .eq("user_id", user.id)
    .eq("active", true);
  if (error)
    throw new Error(
      "Could not load business access. Check hosted migrations and retry.",
    );
  const memberships: Membership[] = (data ?? []).flatMap((row) => {
    const organization = (Array.isArray(row.organizations)
      ? row.organizations[0]
      : row.organizations) as unknown as Organization;
    return organization?.active
      ? [{ role: row.role as Role, organization }]
      : [];
  });
  if (!memberships.length) redirect("/onboarding");
  const selected = (await cookies()).get("finoredesk-organization")?.value;
  const membership =
    memberships.find((m) => m.organization.id === selected) ?? memberships[0];
  const { data: assurance, error: assuranceError } =
    await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError)
    throw new Error("Could not verify account security. Please sign in again.");
  if (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2")
    redirect("/security?challenge=1");
  // Mandatory MFA for administrative web access, without changing mobile database policies.
  if (
    ["owner", "admin"].includes(membership.role) &&
    assurance?.currentLevel !== "aal2"
  )
    redirect("/security?required=1");
  const paidMode = !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    ["inclusive", "exclusive"].includes(process.env.BILLING_TAX_MODE ?? "")
  );
  let canWrite = membership.role !== "viewer";
  if (paidMode) {
    const access = await db.rpc("web_access", {
      org: membership.organization.id,
    });
    if (access.error)
      throw new Error(
        "Could not verify subscription access. Check the web database setup.",
      );
    canWrite = canWrite && access.data?.can_write === true;
  }
  return {
    db,
    user,
    organization: membership.organization,
    role: membership.role,
    memberships,
    canWrite,
  };
});

export async function requireWriter() {
  const context = await workspaceContext();
  if (context.role === "viewer")
    throw new Error("You have view-only access to this business.");
  if (!context.canWrite) redirect("/workspace/billing?access=required");
  return context;
}
export async function requireAdmin() {
  const context = await workspaceContext();
  if (!["owner", "admin"].includes(context.role))
    throw new Error("Business admin permission is required.");
  return context;
}
