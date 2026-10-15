import Link from "next/link";
import { Plus, ArrowUpRight } from "lucide-react";
import { contactPage } from "@/lib/server/repository";
import { workspaceContext } from "@/lib/server/context";
import {
  PageHeading,
  SearchBar,
  EmptyState,
  Pagination,
  Notice,
} from "@/components/ui";
export default async function Contacts({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    q?: string;
    page?: string;
    saved?: string;
  }>;
}) {
  const p = await searchParams,
    kind = p.kind === "supplier" ? "supplier" : "customer",
    c = await workspaceContext(),
    r = await contactPage(kind, p.q, p.page);
  return (
    <>
      <PageHeading
        title="Good business starts with people."
        description="Customers and suppliers, all in one place."
      >
        {c.canWrite && (
          <Link
            className="button"
            href={`/workspace/contacts/new?kind=${kind}`}
          >
            <Plus size={15} />
            Add {kind}
          </Link>
        )}
      </PageHeading>
      {(p.saved === "created" || p.saved === "updated") && (
        <Notice tone="success">
          {kind === "customer" ? "Customer" : "Supplier"}{" "}
          {p.saved === "created" ? "created" : "updated"} successfully.
        </Notice>
      )}
      <div className="toolbar">
        <Link
          className={`button button-small ${kind === "customer" ? "" : "button-secondary"}`}
          href="/workspace/contacts"
        >
          Customers
        </Link>
        <Link
          className={`button button-small ${kind === "supplier" ? "" : "button-secondary"}`}
          href="/workspace/contacts?kind=supplier"
        >
          Suppliers
        </Link>
      </div>
      <div className="panel">
        <form className="filter-bar" method="get">
          <input type="hidden" name="kind" value={kind} />
          <label className="search-field">
            <input
              name="q"
              defaultValue={p.q}
              placeholder={`Search ${kind}s`}
              aria-label={`Search ${kind}s`}
            />
          </label>
          <button className="button button-secondary">Search</button>
        </form>
        {r.rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>ABN</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <Link
                        className="table-link"
                        href={`/workspace/contacts/${x.id}`}
                      >
                        {x.name}
                      </Link>
                      <span className="subtext">{kind}</span>
                    </td>
                    <td>{x.email || "—"}</td>
                    <td>{x.phone || "—"}</td>
                    <td>{x.abn || "—"}</td>
                    <td>
                      <Link
                        className="icon-button"
                        aria-label={`Open ${x.name}`}
                        href={`/workspace/contacts/${x.id}`}
                      >
                        <ArrowUpRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              p.q
                ? "No matching contacts."
                : `Your first ${kind}, a fresh start.`
            }
            description={
              p.q
                ? "Try another name or clear your search."
                : `Add a ${kind} to keep their details and records together.`
            }
            href={
              !p.q && c.canWrite
                ? `/workspace/contacts/new?kind=${kind}`
                : undefined
            }
            action={`Add ${kind}`}
            kind="contacts"
          />
        )}
        <Pagination
          result={r}
          base="/workspace/contacts"
          query={{ kind, q: p.q ?? "" }}
        />
      </div>
    </>
  );
}
