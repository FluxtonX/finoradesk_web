import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  FileText,
  Receipt,
  Plus,
  Download,
} from "lucide-react";
import { money } from "@/lib/domain/money";
import type { Report } from "@/lib/domain/types";
import { EmptyArt } from "./brand";
import { EmptyState, SectionTitle, DateLabel, Notice } from "./ui";
export function ReportStats({ report: r }: { report: Report }) {
  const items = [
    [
      "Recorded payments",
      r.payments_cents,
      "Based on recorded payment dates",
      ArrowDownLeft,
      true,
    ],
    [
      "Paid expenses",
      r.paid_expenses_cents,
      "Excludes unpaid and unknown",
      ArrowUpRight,
      false,
    ],
    [
      "Outstanding",
      r.outstanding_cents,
      "All outstanding issued invoices",
      FileText,
      false,
    ],
    [
      "Overdue",
      r.overdue_cents,
      `${r.overdue_count} overdue invoice${r.overdue_count === 1 ? "" : "s"}`,
      Clock,
      false,
    ],
  ] as const;
  return (
    <div className="stats-grid">
      {items.map(([label, value, note, Icon, accent]) => (
        <article
          className={`panel metric ${accent ? "metric-accent" : ""}`}
          key={label}
        >
          <div className="metric-label">
            <Icon size={14} />
            {label}
          </div>
          <div className="metric-value">{money(value)}</div>
          <div className="metric-note">{note}</div>
          <Icon className="metric-symbol" size={65} />
        </article>
      ))}
    </div>
  );
}
export function CashChart({ report: r }: { report: Report }) {
  const hasMovement = r.trend.some((d) => d.in || d.out),
    max = Math.max(1, ...r.trend.flatMap((d) => [d.in, d.out]));
  const stride = Math.max(1, Math.ceil(r.trend.length / 45));
  const groups = r.trend.reduce<{ date: string; in: number; out: number }[]>(
    (a, d, i) => {
      if (i % stride === 0) a.push({ ...d });
      else {
        a[a.length - 1].in += d.in;
        a[a.length - 1].out += d.out;
      }
      return a;
    },
    [],
  );
  const groupedMax = Math.max(max, ...groups.flatMap((d) => [d.in, d.out]));
  return (
    <>
      <SectionTitle title="Recorded cash flow" />
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <strong style={{ fontSize: 24, letterSpacing: -1 }}>
          {money(r.payments_cents - r.paid_expenses_cents)}
        </strong>
        <span className="muted" style={{ fontSize: 10 }}>
          Recorded net movement
        </span>
      </div>
      {hasMovement ? (
        <div
          className="flow-chart"
          role="img"
          aria-label={`Recorded payments ${money(r.payments_cents)}; paid expenses ${money(r.paid_expenses_cents)}. Not a bank balance.`}
        >
          {groups.map((d) => (
            <div
              key={d.date}
              className="bar-group"
              title={`${d.date}: payments ${money(d.in)}, paid expenses ${money(d.out)}`}
            >
              <div
                className="bar"
                style={{ height: `${(d.in / groupedMax) * 95}%` }}
              />
              <div
                className="bar out"
                style={{ height: `${(d.out / groupedMax) * 95}%` }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="chart-empty">
          Your recorded payments and paid expenses will appear here.
        </div>
      )}
      <div className="chart-legend">
        <span>
          <i />
          Recorded payments
        </span>
        <span>
          <i />
          Paid expenses
        </span>
      </div>
      <p
        className="muted"
        style={{ fontSize: 10, marginTop: 16, marginBottom: 0 }}
      >
        User-recorded activity. This is not a bank balance or bank
        reconciliation.
      </p>
    </>
  );
}
export function CategoryChart({ report: r }: { report: Report }) {
  const max = Math.max(1, ...r.categories.map((c) => c.total_cents));
  return (
    <>
      <SectionTitle title="Expenses by category" />
      {r.categories.length ? (
        r.categories.map((c) => (
          <div className="category-row" key={c.name}>
            <span>{c.name}</span>
            <strong>{money(c.total_cents)}</strong>
            <div className="category-track">
              <div
                className="category-fill"
                style={{ width: `${(c.total_cents / max) * 100}%` }}
              />
            </div>
          </div>
        ))
      ) : (
        <div className="chart-empty">
          Categories appear as you record expenses.
        </div>
      )}
    </>
  );
}
export function DashboardView({
  report: r,
  business,
  canWrite,
}: {
  report: Report;
  business: string;
  canWrite: boolean;
}) {
  return (
    <>
      <div className="welcome-card">
        <div>
          <span className="eyebrow">A LITTLE CLARITY GOES A LONG WAY</span>
          <h2>Your business, at a glance.</h2>
          <p>{business} · This month’s recorded activity</p>
        </div>
        <EmptyArt kind="overview" />
      </div>
      <div className="actions">
        {canWrite && (
          <>
            <Link
              href="/workspace/invoices/new"
              className={`button ${!canWrite ? "button-secondary" : ""}`}
            >
              <Plus size={15} />
              Create invoice
            </Link>
            <Link
              href="/workspace/expenses/new"
              className="button button-secondary"
            >
              <Plus size={15} />
              Record expense
            </Link>
          </>
        )}
        <Link
          href="/workspace/transfer"
          className="text-link"
          style={{ marginLeft: "auto" }}
        >
          <Download size={14} />
          Export records
        </Link>
      </div>
      {!r.has_activity ? (
        <div className="panel" style={{ marginTop: 25 }}>
          <EmptyState
            title="Your next chapter starts here."
            description="Add your first customer and invoice. Your overview will grow with your saved records."
            href={canWrite ? "/workspace/contacts/new" : undefined}
            action="Add a customer"
            kind="overview"
          />
        </div>
      ) : (
        <>
          <ReportStats report={r} />
          {r.overdue_count > 0 && (
            <Notice>
              {r.overdue_count} invoice{r.overdue_count === 1 ? " is" : "s are"}{" "}
              overdue, with {money(r.overdue_cents)} recorded outstanding.{" "}
              <Link
                className="text-link"
                href="/workspace/invoices?status=Overdue"
              >
                Review invoices
                <ArrowUpRight size={14} />
              </Link>
            </Notice>
          )}
          <div className="dashboard-grid">
            <section className="panel">
              <CashChart report={r} />
            </section>
            <section className="panel">
              <CategoryChart report={r} />
            </section>
            <section className="panel">
              <SectionTitle
                title="Upcoming receivables"
                href="/workspace/invoices"
              />
              {r.upcoming.length ? (
                <div className="row-list">
                  {r.upcoming.map((i) => (
                    <Link
                      className="row-item"
                      href={`/workspace/invoices/${i.id}`}
                      key={i.id}
                    >
                      <div className="row-icon">
                        <FileText size={18} />
                      </div>
                      <div className="row-main">
                        <strong>{i.customer_name}</strong>
                        <small>
                          {i.number} · Due <DateLabel value={i.due_date} />
                        </small>
                      </div>
                      <strong className="row-end">
                        {money(i.outstanding_cents)}
                      </strong>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="muted">No upcoming outstanding invoices.</p>
              )}
            </section>
            <section className="panel">
              <SectionTitle
                title="Recent expenses"
                href="/workspace/expenses"
              />
              {r.recent_expenses.length ? (
                r.recent_expenses.map((e) => (
                  <Link
                    className="row-item"
                    href={`/workspace/expenses/${e.id}`}
                    key={e.id}
                  >
                    <div className="row-icon">
                      <Receipt size={17} />
                    </div>
                    <div className="row-main">
                      <strong>{e.description}</strong>
                      <small>
                        <DateLabel value={e.transaction_date} />
                      </small>
                    </div>
                    <strong className="row-end">{money(e.total_cents)}</strong>
                  </Link>
                ))
              ) : (
                <p className="muted">No expenses recorded yet.</p>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
