import { workspaceContext } from "@/lib/server/context";
import { checked } from "@/lib/server/errors";
import {
  PageHeading,
  Notice,
  DateLabel,
  Pagination,
  EmptyState,
} from "@/components/ui";
import { pagination } from "@/lib/domain/validation";
export default async function Activity({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const c = await workspaceContext();
  if (!["owner", "admin"].includes(c.role))
    return <Notice>Business admins can view the audit trail.</Notice>;
  const page = pagination((await searchParams).page),
    size = 30;
  const result = await c.db
    .from("audit_events")
    .select("id,action,resource_id,created_at", { count: "exact" })
    .eq("organization_id", c.organization.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * size, page * size - 1);
  const rows = checked(result) ?? [];
  return (
    <>
      <PageHeading
        title="A record you can follow."
        description="Server-recorded activity for this business."
      />
      <section className="panel">
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Record</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.action}</td>
                    <td>{r.resource_id?.slice(0, 8) ?? "—"}</td>
                    <td>
                      <DateLabel value={r.created_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No events yet."
            description="Saved changes will leave a server-recorded trail."
          />
        )}
        <Pagination
          result={{ rows, total: result.count ?? 0, page, size }}
          base="/workspace/activity"
        />
      </section>
    </>
  );
}
