import { requireWriter } from "@/lib/server/context";
import { InvoiceEditor } from "@/components/invoice-editor";
import { PageHeading } from "@/components/ui";
export default async function NewInvoice() {
  const c = await requireWriter();
  return (
    <>
      <PageHeading
        title="A new invoice."
        description="Start with the details. Review before issuing."
      />
      <InvoiceEditor organization={c.organization} />
    </>
  );
}
