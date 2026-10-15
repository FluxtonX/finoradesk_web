import Link from "next/link";
import { tickets } from "@/lib/server/repository";
import { PageHeading, Status, DateLabel, EmptyState } from "@/components/ui";
import { SupportForm } from "@/components/support-forms";
export default async function Support() {
  const rows = await tickets();
  return (
    <>
      <PageHeading
        title="A little help, when you need it."
        description="Ask a question or request setup and migration assistance."
      />
      <div className="two-columns">
        <section className="panel">
          <h2>Your requests</h2>
          {rows.length ? (
            rows.map((t) => (
              <Link
                className="row-item"
                key={t.id}
                href={`/workspace/support/${t.id}`}
              >
                <div className="row-main">
                  <strong>{t.subject}</strong>
                  <small>
                    <DateLabel value={t.created_at} />
                  </small>
                </div>
                <Status value={t.status} />
              </Link>
            ))
          ) : (
            <EmptyState
              title="All clear here."
              description="Your support conversations will appear here."
              kind="support"
            />
          )}
        </section>
        <section className="panel">
          <h2>Start a conversation</h2>
          <SupportForm />
          <p className="muted" style={{ fontSize: 11, marginTop: 18 }}>
            Assisted services are requests for review, not confirmed bookings or
            regulated professional advice.
          </p>
        </section>
      </div>
    </>
  );
}
