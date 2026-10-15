import "server-only";
import { workspaceContext } from "./context";
import { checked } from "./errors";
import { pagination, searchText, validPeriod } from "@/lib/domain/validation";
import type {
  Contact,
  Invoice,
  InvoiceLine,
  Expense,
  Receipt,
  Category,
  PageResult,
  Report,
  Payment,
  DeliveryJob,
  AuditEvent,
  Ticket,
  SupportMessage,
} from "@/lib/domain/types";

const SIZE = 20;
export async function contactPage(
  kind: "customer" | "supplier",
  search = "",
  pageValue?: string,
): Promise<PageResult<Contact>> {
  const { db, organization } = await workspaceContext();
  const page = pagination(pageValue);
  let query = db
    .from("contacts")
    .select("*", { count: "exact" })
    .eq("organization_id", organization.id)
    .eq("type", kind)
    .eq("archived", false);
  const text = searchText(search);
  if (text) query = query.ilike("name", `%${text}%`);
  const result = await query
    .order("name")
    .order("id")
    .range((page - 1) * SIZE, page * SIZE - 1);
  return {
    rows: checked(result) as Contact[],
    total: result.count ?? 0,
    page,
    size: SIZE,
  };
}
export async function contactById(id: string) {
  const { db, organization } = await workspaceContext();
  return checked(
    await db
      .from("contacts")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("id", id)
      .single(),
  ) as Contact;
}
export async function invoicePage(
  search = "",
  status = "",
  pageValue?: string,
): Promise<PageResult<Invoice>> {
  const { db, organization } = await workspaceContext();
  const page = pagination(pageValue);
  let query = db
    .from("invoice_balances")
    .select("*", { count: "exact" })
    .eq("organization_id", organization.id);
  const text = searchText(search);
  if (text)
    query = query.or(`number.ilike.%${text}%,customer_name.ilike.%${text}%`);
  if (
    ["Draft", "Issued", "Overdue", "Paid", "Partial", "Void"].includes(status)
  )
    query = query.eq("derived_status", status);
  const result = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * SIZE, page * SIZE - 1);
  return {
    rows: checked(result) as Invoice[],
    total: result.count ?? 0,
    page,
    size: SIZE,
  };
}
export async function invoiceDetail(id: string) {
  const { db, organization } = await workspaceContext();
  const results = await Promise.all([
    db
      .from("invoice_balances")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("id", id)
      .single(),
    db
      .from("invoice_items")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("invoice_id", id)
      .order("position"),
    db
      .from("invoice_payments")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("invoice_id", id)
      .order("payment_date"),
    db
      .from("notification_jobs")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("invoice_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    db
      .from("record_events")
      .select("id,action,created_at")
      .eq("organization_id", organization.id)
      .eq("invoice_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  return {
    invoice: checked(results[0]) as Invoice,
    lines: (checked(results[1]) as InvoiceLine[]).map((l) => ({
      ...l,
      quantity: String(l.quantity),
    })),
    payments: checked(results[2]) as Payment[],
    jobs: checked(results[3]) as DeliveryJob[],
    history: checked(results[4]) as AuditEvent[],
  };
}
export async function expensePage(
  search = "",
  status = "",
  pageValue?: string,
): Promise<PageResult<Expense>> {
  const { db, organization } = await workspaceContext();
  const page = pagination(pageValue);
  let query = db
    .from("expenses")
    .select("*", { count: "exact" })
    .eq("organization_id", organization.id)
    .eq("archived", false);
  const text = searchText(search);
  if (text) query = query.ilike("description", `%${text}%`);
  if (["paid", "unpaid", "unknown"].includes(status))
    query = query.eq("payment_status", status);
  const result = await query
    .order("transaction_date", { ascending: false })
    .order("id")
    .range((page - 1) * SIZE, page * SIZE - 1);
  return {
    rows: checked(result) as Expense[],
    total: result.count ?? 0,
    page,
    size: SIZE,
  };
}
export async function expenseById(id: string) {
  const { db, organization } = await workspaceContext();
  const expense = checked(
    await db
      .from("expenses")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("id", id)
      .single(),
  ) as Expense;
  const history = checked(
    await db
      .from("record_events")
      .select("id,action,created_at")
      .eq("organization_id", organization.id)
      .eq("expense_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ) as AuditEvent[];
  return { expense, history };
}
export async function categories() {
  const { db, organization } = await workspaceContext();
  return checked(
    await db
      .from("expense_categories")
      .select("id,name")
      .eq("organization_id", organization.id)
      .order("name"),
  ) as Category[];
}
export async function receiptPage(
  pageValue?: string,
): Promise<PageResult<Receipt>> {
  const { db, organization } = await workspaceContext();
  const page = pagination(pageValue);
  const result = await db
    .from("receipts")
    .select("*", { count: "exact" })
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * SIZE, page * SIZE - 1);
  return {
    rows: checked(result) as Receipt[],
    total: result.count ?? 0,
    page,
    size: SIZE,
  };
}
export async function report(from: string, to: string) {
  const { db, organization } = await workspaceContext();
  validPeriod(from, to);
  return checked(
    await db.rpc("report_summary", {
      org: organization.id,
      date_from: from,
      date_to: to,
    }),
  ) as Report;
}
export async function tickets() {
  const { db, organization } = await workspaceContext();
  return checked(
    await db
      .from("support_tickets")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ) as Ticket[];
}
export async function ticketThread(id: string) {
  const { db, organization } = await workspaceContext();
  const ticket = checked(
    await db
      .from("support_tickets")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("id", id)
      .single(),
  ) as Ticket;
  const messages = checked(
    await db
      .from("support_messages")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("ticket_id", id)
      .order("created_at")
      .limit(200),
  ) as SupportMessage[];
  return { ticket, messages };
}
