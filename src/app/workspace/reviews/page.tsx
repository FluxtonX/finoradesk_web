import Link from "next/link";
import { workspaceContext } from "@/lib/server/context";
import {
  PageHeading,
  EmptyState,
  Notice,
  Status,
  DateLabel,
  Pagination,
} from "@/components/ui";
import { ReviewDecision, ApprovalPolicy } from "@/components/review-controls";
import { pagination } from "@/lib/domain/validation";
import { money } from "@/lib/domain/money";
export default async function Reviews({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const c = await workspaceContext(),
    page = pagination((await searchParams).page),
    size = 20;
  const result = await c.db
    .from("web_record_reviews")
    .select("*", { count: "exact" })
    .eq("organization_id", c.organization.id)
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * size, page * size - 1);
  const prefs = await c.db
    .from("web_business_preferences")
    .select("invoice_approval_required")
    .eq("organization_id", c.organization.id)
    .maybeSingle();
  if (result.error)
    return (
      <>
        <PageHeading title="A second pair of eyes." />
        <Notice>Review workflows need the latest web database setup.</Notice>
      </>
    );
  const rows = result.data ?? [],
    canAdmin = ["owner", "admin"].includes(c.role);
  return (
    <>
      <PageHeading
        title="A second pair of eyes."
        description="Review saved invoices and expenses before the next step."
      />
      {canAdmin && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <h2>Invoice approval policy</h2>
          <p className="muted">
            Optional two-person approval before web invoice issue. Changed
            drafts need a fresh review. Expense reviews record approval without
            moving money.
          </p>
          <ApprovalPolicy
            required={prefs.data?.invoice_approval_required === true}
          />
        </section>
      )}
      <div className="panel">
        {rows.length ? (
          rows.map((r) => (
            <article
              key={r.id}
              style={{
                padding: "20px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div className="section-title">
                <div>
                  <Link
                    className="table-link"
                    href={`/workspace/${r.record_kind === "invoice" ? "invoices" : "expenses"}/${r.record_id}`}
                  >
                    {r.record_kind === "invoice" ? "Invoice" : "Expense"} ·{" "}
                    {r.snapshot.description ??
                      r.snapshot.number ??
                      r.record_id.slice(0, 8)}
                  </Link>
                  <small style={{ display: "block" }}>
                    <DateLabel value={r.created_at} /> ·{" "}
                    {money(r.snapshot.total_cents)}
                  </small>
                </div>
                <Status value={r.status} />
              </div>
              <details>
                <summary>Saved version being reviewed</summary>
                <p style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
                  {r.snapshot.description ?? r.snapshot.notes ?? "No notes."}
                </p>
                {Array.isArray(r.snapshot.lines) &&
                  r.snapshot.lines.map(
                    (
                      line: {
                        description: string;
                        quantity: string;
                        unit_cents: number;
                      },
                      i: number,
                    ) => (
                      <p key={i} style={{ fontSize: 12 }}>
                        {line.description} · {line.quantity} ×{" "}
                        {money(line.unit_cents)}
                      </p>
                    ),
                  )}
              </details>
              {r.note && <Notice>{r.note}</Notice>}
              {r.status === "requested" &&
                canAdmin &&
                r.requested_by !== c.user.id && <ReviewDecision id={r.id} />}
              {r.status === "requested" && r.requested_by === c.user.id && (
                <p className="muted" style={{ fontSize: 11 }}>
                  A different active business admin must review your request.
                </p>
              )}
            </article>
          ))
        ) : (
          <EmptyState
            title="Nothing waiting for review."
            description="Request a review from a saved draft invoice or expense."
            kind="reviews"
          />
        )}
        <Pagination
          result={{ rows, total: result.count ?? 0, page, size }}
          base="/workspace/reviews"
        />
      </div>
    </>
  );
}
