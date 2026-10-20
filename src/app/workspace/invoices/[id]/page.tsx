import { deliveryEnabled } from "@/lib/server/delivery";
import { RequestReview } from "@/components/review-controls";
import Link from "next/link";
import { notFound } from "next/navigation";
import { invoiceDetail } from "@/lib/server/repository";
import { workspaceContext } from "@/lib/server/context";
import { money } from "@/lib/domain/money";
import { businessDate, uuid } from "@/lib/domain/validation";
import { PageHeading, Status, DateLabel } from "@/components/ui";
import { InvoiceControls } from "@/components/invoice-controls";
export default async function InvoiceDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const c = await workspaceContext(),
    { invoice: i, lines, payments, jobs, history } = await invoiceDetail(id),
    business = i.organization_snapshot ?? c.organization;
  const emailResult = await c.db
    .from("web_email_deliveries")
    .select("id,kind,state,recipient,last_error,created_at")
    .eq("organization_id", c.organization.id)
    .eq("invoice_id", id)
    .order("created_at", { ascending: false })
    .limit(30);
  const scheduleResult = await c.db
    .from("web_reminder_schedules")
    .select("opted_in,runs,next_run_at")
    .eq("organization_id", c.organization.id)
    .eq("invoice_id", id)
    .maybeSingle();
  const reviewSetup =
    i.state === "draft" && c.canWrite
      ? await c.db
          .from("web_business_preferences")
          .select("invoice_approval_required")
          .eq("organization_id", c.organization.id)
          .maybeSingle()
      : null;
  return (
    <>
      <PageHeading
        title={i.number ?? "Draft invoice"}
        description="A clear record of the work and its payments."
      >
        <Link className="button button-secondary" href="/workspace/invoices">
          All invoices
        </Link>
        {i.state === "draft" && c.canWrite && (
          <Link className="button" href={`/workspace/invoices/${id}/edit`}>
            Edit draft
          </Link>
        )}
      </PageHeading>
      {i.state === "draft" &&
        c.canWrite &&
        reviewSetup &&
        !reviewSetup.error && (
          <div className="toolbar">
            <RequestReview kind="invoice" id={id} />
            <Link href="/workspace/reviews" className="text-link">
              Open review queue
            </Link>
          </div>
        )}
      <div className="two-columns">
        <div>
          <section className="panel">
            <div className="section-title">
              <h2>{business.name}</h2>
              <Status value={i.derived_status} />
            </div>
            <div className="detail-meta">
              <div>
                <small>Billed to</small>
                <strong>{i.contact_snapshot?.name ?? i.customer_name}</strong>
                <p>
                  {i.contact_snapshot?.address ?? ""}
                  <br />
                  {i.contact_snapshot?.email ?? ""}
                </p>
              </div>
              <div>
                <small>Invoice dates</small>
                <p>
                  Issued <DateLabel value={i.issue_date} />
                  <br />
                  Due <DateLabel value={i.due_date} />
                </p>
                {business.abn && <p>ABN {business.abn}</p>}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th className="amount">Unit AUD</th>
                    <th>GST</th>
                    <th className="amount">Total AUD</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, j) => (
                    <tr key={l.id ?? j}>
                      <td>{l.description}</td>
                      <td>{l.quantity}</td>
                      <td className="amount">{money(l.unit_cents)}</td>
                      <td>{l.tax_mode.replaceAll("_", " ")}</td>
                      <td className="amount">{money(l.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              className="summary-list"
              style={{ maxWidth: 330, margin: "30px 0 15px auto" }}
            >
              <div>
                <span>Subtotal</span>
                <strong>{money(i.subtotal_cents)}</strong>
              </div>
              <div>
                <span>GST</span>
                <strong>{money(i.tax_cents)}</strong>
              </div>
              <div className="total">
                <span>Total AUD</span>
                <strong>{money(i.total_cents)}</strong>
              </div>
              <div>
                <span>Recorded payments</span>
                <strong>{money(i.paid_cents)}</strong>
              </div>
              <div>
                <span>Outstanding</span>
                <strong>{money(i.outstanding_cents)}</strong>
              </div>
            </div>
            {i.notes && (
              <>
                <hr className="divider" />
                <h3>Notes</h3>
                <p style={{ whiteSpace: "pre-wrap" }}>{i.notes}</p>
              </>
            )}
          </section>
          <section className="panel">
            <h2>Recorded payments</h2>
            {payments.length ? (
              payments.map((p) => (
                <div className="row-item" key={p.id}>
                  <div className="row-main">
                    <strong>{money(p.amount_cents)}</strong>
                    <small>
                      <DateLabel value={p.payment_date} /> ·{" "}
                      {p.reference || "Manual payment"}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No payments recorded yet.</p>
            )}
          </section>
          <section className="panel">
            <h2>Activity & delivery</h2>
            {jobs.map((j) => (
              <div className="row-item" key={j.id}>
                <div className="row-main">
                  <strong>{j.kind} request</strong>
                  <small>
                    {j.last_error ?? "Delivery state recorded by the backend."}
                  </small>
                </div>
                <Status value={j.status} />
              </div>
            ))}
            {history.map((h) => (
              <div className="row-item" key={h.id}>
                <div className="row-main">
                  <strong>{h.action}</strong>
                  <small>
                    <DateLabel value={h.created_at} />
                  </small>
                </div>
              </div>
            ))}
          </section>
        </div>
        <InvoiceControls
          invoice={i}
          emailEnabled={
            deliveryEnabled() && !emailResult.error && !scheduleResult.error
          }
          reminderSchedule={scheduleResult.data}
          emailDeliveries={emailResult.data ?? []}
          role={c.canWrite ? c.role : "viewer"}
          today={businessDate(c.organization.timezone)}
          timezone={c.organization.timezone}
        />
      </div>
    </>
  );
}
