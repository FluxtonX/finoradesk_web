import { PageHeading } from "@/components/ui";
import { DashboardView } from "@/components/report-view";
import { workspaceContext } from "@/lib/server/context";
import { report } from "@/lib/server/repository";
import { monthPeriod } from "@/lib/domain/validation";
export default async function Overview() {
  const c = await workspaceContext();
  const p = monthPeriod(c.organization.timezone),
    r = await report(p.from, p.to);
  return (
    <>
      <PageHeading
        eyebrow="YOUR EVERYDAY, IN ORDER"
        title="A clearer day."
        description="Less catching up. More moving forward."
      />
      <DashboardView
        report={r}
        business={c.organization.name}
        canWrite={c.canWrite}
      />
    </>
  );
}
