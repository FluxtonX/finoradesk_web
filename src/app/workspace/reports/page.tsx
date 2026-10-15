import Link from "next/link";
import { workspaceContext } from "@/lib/server/context";
import { report } from "@/lib/server/repository";
import { monthPeriod, validPeriod } from "@/lib/domain/validation";
import { money } from "@/lib/domain/money";
import { PageHeading, Field, Notice } from "@/components/ui";
import {
  ReportStats,
  CashChart,
  CategoryChart,
} from "@/components/report-view";
import { AiAssist } from "@/components/ai-assist";
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const c = await workspaceContext(),
    p = await searchParams,
    defaults = monthPeriod(c.organization.timezone);
  let period = defaults,
    validation = "";
  try {
    period = validPeriod(p.from ?? defaults.from, p.to ?? defaults.to);
  } catch (e) {
    validation = e instanceof Error ? e.message : "Invalid period.";
  }
  const r = await report(period.from, period.to);
  return (
    <>
      <PageHeading
        title="The bigger picture, made clear."
        description="Management reports from your saved business records."
      >
        <Link
          className="button button-secondary"
          href="/workspace/reports/advanced"
        >
          Ageing & supplier reports
        </Link>
        <a
          className="button button-secondary"
          href={`/workspace/reports/export?from=${period.from}&to=${period.to}`}
        >
          Export summary CSV
        </a>
      </PageHeading>
      <form
        className="panel"
        style={{
          display: "flex",
          gap: 14,
          alignItems: "end",
          flexWrap: "wrap",
        }}
      >
        <Field label="From">
          <input type="date" name="from" defaultValue={period.from} required />
        </Field>
        <Field label="To">
          <input type="date" name="to" defaultValue={period.to} required />
        </Field>
        <button className="button">Apply period</button>
        <small>
          {c.organization.timezone} · Applied {period.from} to {period.to}
        </small>
      </form>
      {validation && (
        <Notice tone="error">
          {validation} Showing the current business month.
        </Notice>
      )}
      <ReportStats report={r} />
      <div className="dashboard-grid">
        <section className="panel">
          <CashChart report={r} />
        </section>
        <section className="panel">
          <CategoryChart report={r} />
        </section>
        <section className="panel">
          <h2>Period comparison</h2>
          <div className="summary-list">
            <div>
              <span>Recorded payments</span>
              <strong>{money(r.payments_cents)}</strong>
            </div>
            <div>
              <span>Previous equivalent period</span>
              <strong>{money(r.previous_payments_cents)}</strong>
            </div>
            <div>
              <span>Paid expenses</span>
              <strong>{money(r.paid_expenses_cents)}</strong>
            </div>
            <div>
              <span>Previous equivalent period</span>
              <strong>{money(r.previous_paid_expenses_cents)}</strong>
            </div>
          </div>
        </section>
        <section className="panel">
          <h2>Indicative GST</h2>
          <div className="summary-list">
            <div>
              <span>GST on issued sales</span>
              <strong>{money(r.gst_sales_cents)}</strong>
            </div>
            <div>
              <span>GST on entered expenses</span>
              <strong>{money(r.gst_expenses_cents)}</strong>
            </div>
            <div className="total">
              <span>Difference</span>
              <strong>{money(r.gst_sales_cents - r.gst_expenses_cents)}</strong>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 18 }}>
            Management estimate by issue/expense dates. Not a lodged or
            certified BAS calculation.
          </p>
        </section>
      </div>
      {c.canWrite && (
        <section className="panel" style={{ marginTop: 20 }}>
          <AiAssist kind="report" period={period} />
        </section>
      )}
    </>
  );
}
