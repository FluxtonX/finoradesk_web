"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWriter } from "./context";
import { checked, errorMessage } from "./errors";
import {
  contactInput,
  invoiceInput,
  uuid,
  dateOnly,
  expenseInput,
} from "@/lib/domain/validation";
import { invoiceAmounts } from "@/lib/domain/money";
import type { ActionResult } from "@/lib/domain/types";

function refresh() {
  revalidatePath("/workspace", "layout");
}
export async function saveContact(input: unknown): Promise<ActionResult> {
  try {
    const { id, ...data } = contactInput.parse(input);
    const { db, organization } = await requireWriter();
    const payload = {
      ...data,
      abn: data.abn.replace(/\s/g, "") || null,
      organization_id: organization.id,
    };
    const row = checked(
      id
        ? await db
            .from("contacts")
            .update(payload)
            .eq("organization_id", organization.id)
            .eq("id", id)
            .eq("type", data.type)
            .select("id")
            .single()
        : await db.from("contacts").insert(payload).select("id").single(),
    );
    if (!row) throw new Error("Could not save contact.");
    refresh();
    return { ok: true, message: "Contact saved.", id: row.id };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function archiveContact(id: string): Promise<ActionResult> {
  try {
    uuid.parse(id);
    const { db, organization } = await requireWriter();
    checked(
      await db
        .from("contacts")
        .update({ archived: true })
        .eq("organization_id", organization.id)
        .eq("id", id)
        .select("id")
        .single(),
    );
    refresh();
    return {
      ok: true,
      message: "Contact archived. Existing invoice history is retained.",
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function saveInvoice(input: unknown): Promise<ActionResult> {
  try {
    const data = invoiceInput.parse(input);
    invoiceAmounts(data.lines);
    const { db, organization } = await requireWriter();
    const id = checked(
      await db.rpc("save_invoice", {
        org: organization.id,
        invoice_id: data.id,
        customer_id: data.customer,
        issued: data.issued,
        due: data.due,
        line_items: data.lines,
        invoice_notes: data.notes,
      }),
    ) as string;
    refresh();
    return { ok: true, message: "Draft saved.", id };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function issueInvoice(id: string): Promise<ActionResult> {
  try {
    uuid.parse(id);
    const { db, organization } = await requireWriter();
    checked(
      await db.rpc("issue_web_invoice", {
        org: organization.id,
        target_invoice: id,
      }),
    );
    refresh();
    return { ok: true, message: "Invoice issued. No email has been sent." };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function recordPayment(input: unknown): Promise<ActionResult> {
  try {
    const data = z
      .object({
        id: uuid,
        cents: z.number().int().positive().max(1e12),
        date: dateOnly,
        reference: z.string().max(500),
        key: uuid,
      })
      .parse(input);
    const { db, organization } = await requireWriter();
    checked(
      await db.rpc("record_payment", {
        org: organization.id,
        target_invoice: data.id,
        cents: data.cents,
        paid_on: data.date,
        payment_reference: data.reference,
        idempotency_key: data.key,
      }),
    );
    refresh();
    return { ok: true, message: "Payment recorded." };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function voidInvoice(
  id: string,
  reason: string,
): Promise<ActionResult> {
  try {
    uuid.parse(id);
    z.string().trim().min(3).max(1000).parse(reason);
    const { db, organization } = await requireWriter();
    checked(
      await db.rpc("void_invoice", {
        org: organization.id,
        target_invoice: id,
        reason,
      }),
    );
    refresh();
    return { ok: true, message: "Invoice voided." };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function requestDelivery(
  id: string,
  kind: "invoice" | "reminder",
  key: string,
): Promise<ActionResult> {
  try {
    uuid.parse(id);
    uuid.parse(key);
    z.enum(["invoice", "reminder"]).parse(kind);
    const { db, organization } = await requireWriter();
    const job = checked(
      await db.rpc("queue_invoice_email", {
        org: organization.id,
        target_invoice: id,
        job_kind: kind,
        idempotency_key: key,
      }),
    );
    refresh();
    return {
      ok: true,
      message:
        "Request recorded. Email delivery is unavailable until the verified sender and worker are configured.",
      id: String(job),
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function saveExpense(input: unknown): Promise<ActionResult> {
  try {
    const data = expenseInput.parse(input);
    const { db, organization } = await requireWriter();
    // Stable UUID key makes retries of a new browser expense discoverable, without changing existing RPC semantics.
    if (data.isNew) {
      const existing = checked(
        await db
          .from("expenses")
          .select("id")
          .eq("organization_id", organization.id)
          .eq("import_key", `web:${data.id}`)
          .maybeSingle(),
      );
      if (existing)
        return { ok: true, message: "Expense already saved.", id: existing.id };
    }
    const id = checked(
      await db.rpc("save_expense", {
        org: organization.id,
        expense_id: data.isNew ? null : data.id,
        expense_description: data.description,
        transacted: data.transacted,
        paid_on: data.paid_on,
        payment_state: data.payment_state,
        category: data.category,
        supplier: data.supplier,
        amount: data.amount,
        mode: data.mode,
        expense_notes: data.notes,
        dedupe_key: data.isNew ? `web:${data.id}` : null,
      }),
    ) as string;
    refresh();
    return { ok: true, message: "Expense saved.", id };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
