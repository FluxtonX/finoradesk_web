import { workspaceContext } from "@/lib/server/context";
import { receiptPage } from "@/lib/server/repository";
import { PageHeading, Pagination } from "@/components/ui";
import { ReceiptManager } from "@/components/receipt-manager";
export default async function Receipts({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const c = await workspaceContext(),
    r = await receiptPage((await searchParams).page);
  return (
    <>
      <PageHeading
        title="Everything, filed away."
        description="Private receipts, ready when you need them."
      />
      <div className="panel">
        <ReceiptManager
          org={c.organization.id}
          receipts={r.rows}
          canWrite={c.canWrite}
        />
        <Pagination result={r} base="/workspace/receipts" />
      </div>
    </>
  );
}
