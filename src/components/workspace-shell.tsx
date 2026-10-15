"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Users,
  ChartNoAxesCombined,
  Calculator,
  FolderOpen,
  ArrowRightLeft,
  BookOpen,
  Settings,
  LifeBuoy,
  Menu,
  X,
  LogOut,
  ChevronRight,
  ShieldCheck,
  CreditCard,
  Building2,
  ClipboardList,
  ClipboardCheck,
} from "lucide-react";
import { Brand } from "./brand";
import { selectBusiness, signOut } from "@/lib/server/access-actions";
import type { Membership, Organization, Role } from "@/lib/domain/types";
const primary = [
  ["Overview", "/workspace", LayoutDashboard],
  ["Invoices", "/workspace/invoices", FileText],
  ["Expenses", "/workspace/expenses", Receipt],
  ["Contacts", "/workspace/contacts", Users],
  ["Reports", "/workspace/reports", ChartNoAxesCombined],
] as const;
const tools = [
  ["Review queue", "/workspace/reviews", ClipboardCheck],
  ["Receipts", "/workspace/receipts", FolderOpen],
  ["Import & export", "/workspace/transfer", ArrowRightLeft],
  ["Calculators", "/workspace/calculators", Calculator],
  ["Business guide", "/workspace/guide", BookOpen],
] as const;
const more = [
  ["Plans & billing", "/workspace/billing", CreditCard],
  ["Settings & team", "/workspace/settings", Settings],
  ["Activity", "/workspace/activity", ClipboardList],
  ["Support", "/workspace/support", LifeBuoy],
] as const;
export function WorkspaceShell({
  children,
  organization,
  memberships,
  role,
  email,
  platformSupport = false,
}: {
  children: React.ReactNode;
  organization: Organization;
  memberships: Membership[];
  role: Role;
  email: string;
  platformSupport?: boolean;
}) {
  const pathname = usePathname(),
    router = useRouter();
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [switching, setSwitching] = useState(false);
  const [mobile, setMobile] = useState(false);
  const sidebar = useRef<HTMLElement>(null),
    toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width:760px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobile || !open) return;
    const items = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not([disabled]),select:not([disabled])",
        ) ?? [],
      );
    items()[0]?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
      if (event.key === "Tab") {
        const elements = items(),
          first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [mobile, open]);
  function nav(items: typeof primary | typeof tools | typeof more) {
    return (
      <nav>
        {items.map(([label, href, Icon]) => (
          <Link
            className={`nav-link ${(href === "/workspace" ? pathname === href : pathname.startsWith(href)) ? "active" : ""}`}
            href={href}
            key={href}
            onClick={() => setOpen(false)}
          >
            <Icon />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    );
  }
  async function switchOrg(id: string) {
    setSwitching(true);
    setError("");
    try {
      const r = await selectBusiness(id);
      if (!r.ok) setError(r.message);
      else {
        router.push("/workspace");
        router.refresh();
      }
    } catch {
      setError("Could not switch business. Please retry.");
    } finally {
      setSwitching(false);
    }
  }
  const label =
    [...primary, ...tools, ...more].find(
      ([, href]) => href !== "/workspace" && pathname.startsWith(href),
    )?.[0] ?? "Overview";
  return (
    <div className="app-shell">
      <button
        className={`mobile-overlay ${open ? "is-open" : ""}`}
        aria-label="Close navigation"
        onClick={() => setOpen(false)}
      />
      <aside
        ref={sidebar}
        inert={mobile && !open}
        role={mobile && open ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-label="Workspace navigation"
        className={`sidebar ${open ? "is-open" : ""}`}
      >
        <Brand />
        <span className="sidebar-group">Workspace</span>
        {nav(primary)}
        <span className="sidebar-group">Business tools</span>
        {nav(tools)}
        <div className="sidebar-bottom">
          <div className="sidebar-pilot">
            <strong>A little room to grow.</strong>
            <p>Explore plans for your next chapter.</p>
            <Link
              href="/workspace/billing"
              className="text-link"
              onClick={() => setOpen(false)}
            >
              View pilot plans
              <ChevronRight size={14} />
            </Link>
          </div>
          {nav(more)}
          {platformSupport && (
            <Link
              className="nav-link"
              href="/workspace/platform"
              onClick={() => setOpen(false)}
            >
              <ShieldCheck size={17} />
              Platform support
            </Link>
          )}
          <div className="sidebar-profile">
            <div className="avatar">
              {organization.name.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong title={email}>{email}</strong>
              <small>{role}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  await signOut();
                  router.push("/auth");
                  router.refresh();
                } catch {
                  setError("Could not sign out. Please retry.");
                }
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <button
            ref={toggle}
            className="icon-button mobile-toggle"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={12} />
            <span>{label}</span>
          </div>
          <div className="topbar-right">
            <span className="secure-badge">
              <ShieldCheck size={12} />
              Private workspace
            </span>
            <div className="business-select">
              <Building2 size={16} />
              <select
                aria-label="Selected business"
                value={organization.id}
                disabled={switching}
                onChange={(e) => switchOrg(e.target.value)}
              >
                {memberships.map((m) => (
                  <option value={m.organization.id} key={m.organization.id}>
                    {m.organization.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="avatar">{organization.name[0]}</div>
          </div>
        </header>
        <main id="main" className="workspace-content">
          {error && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )}
          {children}
          <footer className="workspace-footer">
            <span>Finoredesk · A clearer day for your business.</span>
            <span>
              AUD · {organization.timezone.replace("Australia/", "")} business
              time
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
