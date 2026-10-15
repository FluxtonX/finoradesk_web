import Link from "next/link";
import { notFound } from "next/navigation";
import { contactById } from "@/lib/server/repository";
import { workspaceContext } from "@/lib/server/context";
import { uuid } from "@/lib/domain/validation";
import { PageHeading, DateLabel } from "@/components/ui";
import { ContactForm } from "@/components/contact-form";
import { ActionButton } from "@/components/action-button";
import { archiveContact } from "@/lib/server/finance-actions";
import { checked } from "@/lib/server/errors";
export default async function ContactDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const c = await workspaceContext(),
    contact = await contactById(id);
  const history = checked(
    await c.db
      .from("record_events")
      .select("id,action,created_at")
      .eq("organization_id", c.organization.id)
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  );
  return (
    <>
      <PageHeading
        title={contact.name}
        description={`${contact.type === "customer" ? "Customer" : "Supplier"} details and history.`}
      >
        <Link href="/workspace/contacts" className="button button-secondary">
          All contacts
        </Link>
      </PageHeading>
      {c.canWrite ? (
        <ContactForm contact={contact} kind={contact.type} />
      ) : (
        <div className="panel">
          <p>{contact.email || "No email recorded"}</p>
          <p>{contact.address}</p>
          <p>{contact.notes}</p>
        </div>
      )}
      <div className="panel narrow" style={{ marginTop: 20 }}>
        <h2>Record history</h2>
        {(history ?? []).length ? (
          (history ?? []).map((h) => (
            <div className="row-item" key={h.id}>
              <div className="row-main">
                <strong>{h.action === "INSERT" ? "Created" : h.action}</strong>
                <small>
                  <DateLabel value={h.created_at} />
                </small>
              </div>
            </div>
          ))
        ) : (
          <p className="muted">No changes recorded.</p>
        )}
        {c.canWrite && !contact.archived && (
          <div className="toolbar">
            <ActionButton
              action={archiveContact.bind(null, id)}
              confirm="Archive this contact? Existing invoice history will be retained."
              className="button button-danger"
              redirect="/workspace/contacts"
            >
              Archive contact
            </ActionButton>
          </div>
        )}
      </div>
    </>
  );
}
