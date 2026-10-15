import Link from "next/link";
import { Notice } from "@/components/ui";
import { workspaceContext } from "@/lib/server/context";
import { WorkspaceShell } from "@/components/workspace-shell";
import { publicConfig } from "@/lib/config";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!publicConfig()) redirect("/auth?error=Supabase+setup+is+required.");
  const c = await workspaceContext();
  const platform = await c.db.rpc("is_platform_admin");
  return (
    <WorkspaceShell
      organization={c.organization}
      memberships={c.memberships}
      role={c.canWrite ? c.role : "viewer"}
      email={c.user.email ?? "Your account"}
      platformSupport={platform.data === true}
    >
      {!c.canWrite && c.role !== "viewer" && (
        <Notice>
          This workspace is read-only until an active subscription is confirmed.{" "}
          <Link className="text-link" href="/workspace/billing">
            Review billing
          </Link>
          . Exports and support remain available.
        </Notice>
      )}
      {children}
    </WorkspaceShell>
  );
}
