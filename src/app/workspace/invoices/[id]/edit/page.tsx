import { notFound } from "next/navigation";
import { requireWriter } from "@/lib/server/context";
import { invoiceDetail, contactById } from "@/lib/server/repository";
import { InvoiceEditor } from "@/components/invoice-editor";
import { PageHeading, Notice } from "@/components/ui";
import { uuid } from "@/lib/domain/validation";
export default async function EditInvoice({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const c = await requireWriter(),
    d = await invoiceDetail(id);
  if (d.invoice.state !== "draft")
    return <Notice>Issued invoices cannot be edited.</Notice>;
  const contact = await contactById(d.invoice.contact_id);
  return (
    <>
      <PageHeading
        title="Make it just right."
        description="Your draft stays editable until you issue it."
      />
      <InvoiceEditor
        organization={c.organization}
        invoice={d.invoice}
        lines={d.lines}
        contact={contact}
      />
    </>
  );
}
