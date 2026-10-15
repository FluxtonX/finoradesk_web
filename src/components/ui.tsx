import Link from "next/link";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { EmptyArt } from "./brand";
import type { PageResult } from "@/lib/domain/types";
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow ?? "Your workspace"}</span>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </header>
  );
}
export function EmptyState({
  title,
  description,
  href,
  action,
  kind,
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
  kind?: string;
}) {
  return (
    <div className="empty-state">
      <EmptyArt kind={kind} />
      <h2>{title}</h2>
      <p>{description}</p>
      {href && (
        <Link className="button" href={href}>
          <Plus size={16} />
          {action ?? "Get started"}
        </Link>
      )}
    </div>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "error" | "success";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`notice notice-${tone}`}
    >
      {children}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span
      className={`status status-${value.toLowerCase().replace(/[^a-z]/g, "")}`}
    >
      <i />
      {value}
    </span>
  );
}
export function SectionTitle({
  title,
  href,
  label = "View all",
}: {
  title: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {href && (
        <Link href={href} className="text-link">
          {label}
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function SearchBar({
  placeholder,
  statuses = [],
  query = "",
  status = "",
}: {
  placeholder: string;
  statuses?: string[];
  query?: string;
  status?: string;
}) {
  return (
    <form className="filter-bar" method="get">
      <label className="search-field">
        <Search size={18} />
        <input
          name="q"
          defaultValue={query}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </label>
      {statuses.length > 0 && (
        <select
          name="status"
          defaultValue={status}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      )}
      <button className="button button-secondary" type="submit">
        Search
      </button>
    </form>
  );
}
export function Pagination({
  result,
  base,
  query = {},
}: {
  result: PageResult<unknown>;
  base: string;
  query?: Record<string, string>;
}) {
  const { page, size, total } = result;
  const pages = Math.max(1, Math.ceil(total / size));
  function href(next: number) {
    return `${base}?${new URLSearchParams({ ...query, page: String(next) })}`;
  }
  return (
    <nav className="pagination" aria-label="Pagination">
      <span>
        {total
          ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total}`
          : "0 records"}
      </span>
      <div>
        {page > 1 ? (
          <Link
            className="icon-button"
            aria-label="Previous page"
            href={href(page - 1)}
          >
            <ChevronLeft size={18} />
          </Link>
        ) : (
          <button className="icon-button" disabled aria-label="Previous page">
            <ChevronLeft size={18} />
          </button>
        )}
        <span>
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link
            className="icon-button"
            aria-label="Next page"
            href={href(page + 1)}
          >
            <ChevronRight size={18} />
          </Link>
        ) : (
          <button className="icon-button" disabled aria-label="Next page">
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </nav>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <label className="field">
        <span>{label}</span>
        {children}
      </label>
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function DateLabel({ value }: { value: string }) {
  const parts = value.slice(0, 10).split("-");
  return (
    <>{parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value}</>
  );
}
