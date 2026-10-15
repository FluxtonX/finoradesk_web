import { workspaceContext } from "@/lib/server/context";
import { monthPeriod, validPeriod } from "@/lib/domain/validation";
import { PageHeading, Field, Notice, EmptyState } from "@/components/ui";
import { money } from "@/lib/domain/money";
export default async function AdvancedReports({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const c = await workspaceContext(),
    p = await searchParams,
    defaultPeriod = monthPeriod(c.organization.timezone);
  let period = defaultPeriod,
    validation = "";
  try {
    period = validPeriod(
      p.from ?? defaultPeriod.from,
      p.to ?? defaultPeriod.to,
    );
  } catch {
    validation =
      "Choose a valid period of up to one year. Showing the current month.";
  }
  const result = await c.db.rpc("web_advanced_report", {
    org: c.organization.id,
    date_from: period.from,
    date_to: period.to,
  });
  const data = result.data as {
    ageing: Record<string, number>;
    suppliers: {
      id: string;
      name: string;
      total_cents: number;
      paid_cents: number;
      unpaid_cents: number;
    }[];
    unassigned_expenses_cents: number;
  } | null;
  return (
    <>
      <PageHeading
        title="Look a little closer."
        description="Receivables ageing and supplier expenses from recorded activity."
      />
      <form className="panel toolbar">
        <Field label="From">
          <input type="date" name="from" defaultValue={period.from} required />
        </Field>
        <Field label="To">
          <input type="date" name="to" defaultValue={period.to} required />
        </Field>
        <button className="button">Apply period</button>
      </form>
      {validation && <Notice tone="error">{validation}</Notice>}
      {result.error || !data ? (
        <Notice>
          Advanced reports require Growth/Business and the latest web database
          setup.
        </Notice>
      ) : (
        <>
          <section className="panel">
            <h2>Receivables ageing</h2>
            <p className="muted">
              All outstanding issued invoices as of today in business time.
              Independent of the expense period.
            </p>
            <div className="stats-grid">
              {Object.entries(data.ageing).map(([key, value]) => (
                <div className="metric" key={key}>
                  <div className="metric-label">
                    {
                      {
                        current: "Not yet overdue",
                        days_1_30: "1–30 days overdue",
                        days_31_60: "31–60 days overdue",
                        days_61_90: "61–90 days overdue",
                        days_90_plus: "Over 90 days overdue",
                      }[key]
                    }
                  </div>
                  <div className="metric-value">{money(value)}</div>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2>Supplier expenses</h2>
            <p className="muted">
              Top 50 suppliers by entered expenses in the selected period.
              Unknown payment status is not treated as paid.
            </p>
            {data.suppliers.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th className="amount">Entered AUD</th>
                      <th className="amount">Paid</th>
                      <th className="amount">Unpaid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.suppliers.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td className="amount">{money(s.total_cents)}</td>
                        <td className="amount">{money(s.paid_cents)}</td>
                        <td className="amount">{money(s.unpaid_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No supplier expenses in this period."
                description="Link expenses to suppliers to build this view."
              />
            )}
            <Notice>
              Expenses without a supplier:{" "}
              {money(data.unassigned_expenses_cents)}.
            </Notice>
          </section>
        </>
      )}
    </>
  );
}
