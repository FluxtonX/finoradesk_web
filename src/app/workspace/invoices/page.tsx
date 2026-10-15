import Link from "next/link";
import { Plus, ArrowUpRight } from "lucide-react";
import { invoicePage } from "@/lib/server/repository";
import { workspaceContext } from "@/lib/server/context";
import { money } from "@/lib/domain/money";
import {
  PageHeading,
  SearchBar,
  EmptyState,
  Pagination,
  Status,
  DateLabel,
} from "@/components/ui";
export default async function Invoices({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const p = await searchParams,
    c = await workspaceContext(),
    r = await invoicePage(p.q, p.status, p.page);
  return (
    <>
      <PageHeading
        title="Every invoice, in order."
        description="From the first draft to the last recorded payment."
      >
        {c.canWrite && (
          <Link href="/workspace/invoices/new" className="button">
            <Plus size={15} />
            Create invoice
          </Link>
        )}
      </PageHeading>
      <div className="panel">
        <SearchBar
          placeholder="Search invoice or customer"
          query={p.q}
          status={p.status}
          statuses={["Draft", "Issued", "Partial", "Overdue", "Paid", "Void"]}
        />
        {r.rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th className="amount">Total AUD</th>
                  <th className="amount">Outstanding</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {r.rows.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link
                        className="table-link"
                        href={`/workspace/invoices/${i.id}`}
                      >
                        {i.number ?? "Draft invoice"}
                      </Link>
                      <span className="subtext">
                        <DateLabel value={i.issue_date} />
                      </span>
                    </td>
                    <td>{i.customer_name}</td>
                    <td>
                      <DateLabel value={i.due_date} />
                    </td>
                    <td>
                      <Status value={i.derived_status} />
                    </td>
                    <td className="amount">{money(i.total_cents)}</td>
                    <td className="amount">{money(i.outstanding_cents)}</td>
                    <td>
                      <Link
                        className="icon-button"
                        href={`/workspace/invoices/${i.id}`}
                        aria-label={`Open ${i.number ?? "draft invoice"}`}
                      >
                        <ArrowUpRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              p.q || p.status
                ? "No invoices match."
                : "Your work deserves a good invoice."
            }
            description={
              p.q || p.status
                ? "Try another search or status."
                : "Add your first invoice and keep the journey from draft to paid in one place."
            }
            href={
              !p.q && !p.status && c.canWrite
                ? "/workspace/invoices/new"
                : undefined
            }
            action="Create invoice"
            kind="invoices"
          />
        )}
        <Pagination
          result={r}
          base="/workspace/invoices"
          query={{ q: p.q ?? "", status: p.status ?? "" }}
        />
      </div>
    </>
  );
}
