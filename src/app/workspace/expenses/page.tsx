import Link from "next/link";
import { Plus } from "lucide-react";
import { expensePage } from "@/lib/server/repository";
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
export default async function Expenses({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const p = await searchParams,
    c = await workspaceContext(),
    r = await expensePage(p.q, p.status, p.page);
  return (
    <>
      <PageHeading
        title="The little things, accounted for."
        description="Keep expenses, receipts and payment status together."
      >
        {c.canWrite && (
          <Link className="button" href="/workspace/expenses/new">
            <Plus size={15} />
            Record expense
          </Link>
        )}
      </PageHeading>
      <div className="panel">
        <SearchBar
          placeholder="Search expenses"
          query={p.q}
          status={p.status}
          statuses={["paid", "unpaid", "unknown"]}
        />
        {r.rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Payment</th>
                  <th className="amount">GST</th>
                  <th className="amount">Total AUD</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link
                        className="table-link"
                        href={`/workspace/expenses/${e.id}`}
                      >
                        {e.description}
                      </Link>
                    </td>
                    <td>
                      <DateLabel value={e.transaction_date} />
                    </td>
                    <td>
                      <Status value={e.payment_status} />
                    </td>
                    <td className="amount">{money(e.tax_cents)}</td>
                    <td className="amount">{money(e.total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              p.q || p.status
                ? "No matching expenses."
                : "A place for every expense."
            }
            description={
              p.q || p.status
                ? "Try another search or payment status."
                : "Record an expense, attach its receipt, and leave less to catch up on."
            }
            href={
              !p.q && !p.status && c.canWrite
                ? "/workspace/expenses/new"
                : undefined
            }
            action="Record expense"
            kind="expenses"
          />
        )}
        <Pagination
          result={r}
          base="/workspace/expenses"
          query={{ q: p.q ?? "", status: p.status ?? "" }}
        />
      </div>
    </>
  );
}
