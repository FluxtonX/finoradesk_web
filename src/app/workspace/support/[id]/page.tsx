import { notFound } from "next/navigation";
import { ticketThread } from "@/lib/server/repository";
import { workspaceContext } from "@/lib/server/context";
import { uuid } from "@/lib/domain/validation";
import { PageHeading, Status, DateLabel } from "@/components/ui";
import { SupportForm } from "@/components/support-forms";
export default async function Ticket({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const c = await workspaceContext(),
    { ticket, messages } = await ticketThread(id);
  return (
    <>
      <PageHeading
        title={ticket.subject}
        description="Your support conversation."
      >
        <Status value={ticket.status} />
      </PageHeading>
      <div className="panel narrow">
        {messages.map((m) => (
          <div
            className={`message ${m.created_by === c.user.id ? "own" : ""}`}
            key={m.id}
          >
            <small>
              {m.created_by === c.user.id ? "You" : "Business / support member"}{" "}
              · <DateLabel value={m.created_at} />
            </small>
            {m.body}
          </div>
        ))}
        <hr className="divider" />
        <SupportForm ticketId={id} closed={ticket.status === "closed"} />
      </div>
    </>
  );
}
