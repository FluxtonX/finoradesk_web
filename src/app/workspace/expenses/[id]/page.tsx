import { AiAssist } from "@/components/ai-assist";
import { RequestReview } from "@/components/review-controls";
import { notFound } from "next/navigation";
import { expenseById, categories, contactById } from "@/lib/server/repository";
import { workspaceContext } from "@/lib/server/context";
import { checked } from "@/lib/server/errors";
import { uuid } from "@/lib/domain/validation";
import { ExpenseEditor } from "@/components/expense-editor";
import { ReceiptManager } from "@/components/receipt-manager";
import { PageHeading, DateLabel, Status } from "@/components/ui";
import { money } from "@/lib/domain/money";
import type { Receipt } from "@/lib/domain/types";
export default async function ExpenseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const c = await workspaceContext(),
    { expense: e, history } = await expenseById(id),
    cats = await categories(),
    contact = e.supplier_id ? await contactById(e.supplier_id) : undefined;
  const receipts = checked(
    await c.db
      .from("receipts")
      .select("*")
      .eq("organization_id", c.organization.id)
      .eq("expense_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ) as Receipt[];
  return (
    <>
      <PageHeading
        title="Every detail, together."
        description={e.description}
      />
      {c.canWrite && (
        <div className="toolbar">
          <RequestReview kind="expense" id={id} />
        </div>
      )}
      {c.canWrite ? (
        <ExpenseEditor
          organization={c.organization}
          expense={e}
          categories={cats}
          contact={contact}
        />
      ) : (
        <div className="panel">
          <h2>{e.description}</h2>
          <p>{money(e.total_cents)}</p>
          <Status value={e.payment_status} />
        </div>
      )}
      <section className="panel narrow" style={{ marginTop: 20 }}>
        <h2>Receipts</h2>
        <ReceiptManager
          org={c.organization.id}
          receipts={receipts}
          expenseId={id}
          canWrite={c.canWrite}
        />
      </section>
      {c.canWrite && (
        <section className="panel narrow">
          <AiAssist kind="category" targetId={id} categories={cats} />
        </section>
      )}
      <section className="panel narrow">
        <h2>Correction history</h2>
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
    </>
  );
}
