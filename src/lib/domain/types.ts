export type Role = "owner" | "admin" | "member" | "viewer";
export type TaxMode = "exclusive" | "inclusive" | "gst_free" | "out_of_scope";
export interface Organization {
  id: string;
  name: string;
  abn: string | null;
  address: string;
  timezone: string;
  gst_registered: boolean;
  currency: "AUD";
  reporting_basis: "cash" | "accrual";
  active: boolean;
}
export interface Membership {
  role: Role;
  organization: Organization;
}
export interface Contact {
  id: string;
  organization_id: string;
  type: "customer" | "supplier";
  name: string;
  email: string;
  phone: string;
  abn: string | null;
  address: string;
  notes: string;
  archived: boolean;
  created_at: string;
}
export interface Invoice {
  id: string;
  organization_id: string;
  contact_id: string;
  number: string | null;
  state: "draft" | "issued" | "void";
  issue_date: string;
  due_date: string;
  notes: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  outstanding_cents: number;
  paid_cents: number;
  derived_status: string;
  customer_name: string;
  organization_snapshot: Partial<Organization> | null;
  contact_snapshot: Partial<Contact> | null;
  created_at: string;
  calculation_version: number;
}
export interface InvoiceLine {
  id?: string;
  description: string;
  quantity: string;
  unit_cents: number;
  tax_mode: TaxMode;
  subtotal_cents?: number;
  tax_cents?: number;
  total_cents?: number;
  position?: number;
}
export interface Expense {
  id: string;
  description: string;
  organization_id: string;
  supplier_id: string | null;
  category_id: string;
  transaction_date: string;
  paid_date: string | null;
  payment_status: "paid" | "unpaid" | "unknown";
  tax_mode: TaxMode;
  entered_cents: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string;
  archived: boolean;
}
export interface Receipt {
  id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  object_path: string;
  expense_id: string | null;
  created_at: string;
}
export interface Category {
  id: string;
  name: string;
}
export interface Payment {
  id: string;
  amount_cents: number;
  payment_date: string;
  reference: string;
}
export interface DeliveryJob {
  id: string;
  kind: string;
  status: string;
  last_error: string | null;
  created_at: string;
}
export interface AuditEvent {
  id: string | number;
  action: string;
  resource_id: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
}
export interface Report {
  has_activity: boolean;
  invoiced_cents: number;
  payments_cents: number;
  expenses_cents: number;
  paid_expenses_cents: number;
  outstanding_cents: number;
  overdue_cents: number;
  overdue_count: number;
  gst_sales_cents: number;
  gst_expenses_cents: number;
  previous_payments_cents: number;
  previous_paid_expenses_cents: number;
  trend: { date: string; in: number; out: number }[];
  categories: { name: string; total_cents: number }[];
  upcoming: Pick<
    Invoice,
    "id" | "number" | "customer_name" | "due_date" | "outstanding_cents"
  >[];
  recent_expenses: Pick<
    Expense,
    "id" | "description" | "transaction_date" | "total_cents"
  >[];
}
export interface PageResult<T> {
  rows: T[];
  total: number;
  page: number;
  size: number;
}
export interface ActionResult {
  ok: boolean;
  message: string;
  id?: string;
  url?: string;
}
export interface Ticket {
  id: string;
  subject: string;
  status: string;
  created_at: string;
}
export interface SupportMessage {
  id: string;
  body: string;
  created_by: string;
  created_at: string;
}
export interface Suggestion {
  id: string;
  kind: "invoice" | "category" | "report";
  text: string;
  category_id?: string;
  confidence?: number;
  state: string;
}
