import Link from "next/link";
import { workspaceContext } from "@/lib/server/context";
import { checked } from "@/lib/server/errors";
import { PageHeading } from "@/components/ui";
import {
  BusinessSettings,
  ProfileSettings,
  TeamSettings,
  PrivacySettings,
} from "@/components/settings-forms";
import type { Role } from "@/lib/domain/types";
export default async function Settings() {
  const c = await workspaceContext(),
    canAdmin = ["owner", "admin"].includes(c.role);
  const profile = checked(
    await c.db
      .from("profiles")
      .select("display_name,notification_preferences")
      .eq("id", c.user.id)
      .maybeSingle(),
  );
  const members =
    checked(
      await c.db
        .from("organization_members")
        .select("user_id,role,active")
        .eq("organization_id", c.organization.id)
        .order("role"),
    ) ?? [];
  const invites = canAdmin
    ? (checked(
        await c.db
          .from("organization_invitations")
          .select("id,email,role,expires_at,accepted_at")
          .eq("organization_id", c.organization.id)
          .order("expires_at", { ascending: false })
          .limit(100),
      ) ?? [])
    : [];
  return (
    <>
      <PageHeading
        title="Make the workspace yours."
        description="Your business, team and preferences."
      >
        <Link className="button button-secondary" href="/onboarding">
          Add another business
        </Link>
      </PageHeading>
      <div className="two-columns">
        <div>
          <BusinessSettings organization={c.organization} canAdmin={canAdmin} />
          <TeamSettings
            members={
              members as { user_id: string; role: Role; active: boolean }[]
            }
            invitations={invites}
            canAdmin={canAdmin}
          />
          {canAdmin && <PrivacySettings />}
        </div>
        <ProfileSettings
          name={
            profile?.display_name ?? c.user.user_metadata.display_name ?? ""
          }
          reminders={profile?.notification_preferences?.reminders === true}
        />
      </div>
    </>
  );
}
