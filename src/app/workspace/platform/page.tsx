import { workspaceContext } from "@/lib/server/context";
import { checked } from "@/lib/server/errors";
import { PageHeading, Notice, Status } from "@/components/ui";
import { PlatformTicketForm } from "@/components/support-forms";
export default async function Platform() {
  const c = await workspaceContext(),
    allowed = checked(await c.db.rpc("is_platform_admin"));
  const { data: aal } = await c.db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!allowed || aal?.currentLevel !== "aal2")
    return (
      <Notice>Verified platform support access and MFA are required.</Notice>
    );
  const data = checked(await c.db.rpc("platform_overview")) as {
    organizations: number;
    open_tickets: number;
    subscriptions: number;
    queue: {
      id: string;
      organization_id: string;
      subject: string;
      status: string;
    }[];
  };
  const operating = await c.db.rpc("web_operating_overview");
  const metrics = operating.data as {
    signups: number;
    eligible_businesses: number;
    activated_businesses: number;
    active_invoicing_businesses: number;
    active_web_subscriptions: number;
    cancelled_web_subscriptions: number;
    import_jobs: number;
    import_error_rows: number;
    open_tickets: number;
    mean_first_response_minutes: number | null;
    delivery_needs_review: number;
  } | null;
  return (
    <>
      <PageHeading
        title="Platform support."
        description="Restricted operational metadata. Business financial records are not exposed here."
      />
      <div className="stats-grid">
        {[
          ["Businesses", data.organizations],
          ["Open tickets", data.open_tickets],
          ["Legacy/test subscriptions", data.subscriptions],
        ].map(([label, value]) => (
          <div className="panel metric" key={label}>
            <div className="metric-label">{label}</div>
            <div className="metric-value">{value}</div>
          </div>
        ))}
      </div>
      {metrics ? (
        <section className="panel" style={{ marginBottom: 20 }}>
          <h2>Pilot operating picture</h2>
          <p className="muted">
            Last 30 days unless labelled otherwise. Actual records; no forecast
            revenue.
          </p>
          <div className="stats-grid">
            {[
              ["Sign-ups", metrics.signups],
              [
                "Active invoicing businesses",
                metrics.active_invoicing_businesses,
              ],
              ["Active web subscriptions", metrics.active_web_subscriptions],
              ["Import error rows", metrics.import_error_rows],
              ["Email needs review", metrics.delivery_needs_review],
              [
                "First staff reply",
                metrics.mean_first_response_minutes === null
                  ? "Not measured"
                  : `${metrics.mean_first_response_minutes} min`,
              ],
            ].map(([label, value]) => (
              <div className="metric" key={label}>
                <div className="metric-label">{label}</div>
                <div className="metric-value">{value}</div>
              </div>
            ))}
          </div>
          <Notice>
            Seven-day invoice activation:{" "}
            {metrics.eligible_businesses
              ? `${metrics.activated_businesses} of ${metrics.eligible_businesses} eligible businesses`
              : "Waiting for businesses with at least seven days of history."}{" "}
            Revenue, unit costs, churn rates and satisfaction require further
            measurement.
          </Notice>
        </section>
      ) : (
        <Notice>Operating metrics need the latest web database setup.</Notice>
      )}
      <div className="card-grid">
        {data.queue.map((t) => (
          <section className="panel" key={t.id}>
            <h2>{t.subject}</h2>
            <small>Business {t.organization_id.slice(0, 8)}</small>
            <div className="toolbar">
              <Status value={t.status} />
            </div>
            <PlatformTicketForm id={t.id} status={t.status} />
          </section>
        ))}
      </div>
    </>
  );
}
