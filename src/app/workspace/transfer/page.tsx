import { workspaceContext } from "@/lib/server/context";
import { PageHeading } from "@/components/ui";
import { CsvTransfer } from "@/components/csv-transfer";
export default async function Transfer() {
  const c = await workspaceContext();
  return (
    <>
      <PageHeading
        title="Your records, on your terms."
        description="Bring data in. Take clear records out."
      />
      <CsvTransfer canWrite={c.canWrite} />
    </>
  );
}
