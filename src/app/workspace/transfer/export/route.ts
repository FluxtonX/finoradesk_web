import { NextRequest, NextResponse } from "next/server";
import { workspaceContext } from "@/lib/server/context";
import { checked } from "@/lib/server/errors";
import { csvRow } from "@/lib/domain/csv";
import { decimalMoney } from "@/lib/domain/money";
import { uuid } from "@/lib/domain/validation";
const exports = {
  customers: {
    table: "contacts",
    columns: ["name", "email", "phone", "abn", "address", "notes"],
  },
  suppliers: {
    table: "contacts",
    columns: ["name", "email", "phone", "abn", "address", "notes"],
  },
  invoices: {
    table: "invoice_balances",
    columns: [
      "number",
      "customer_name",
      "issue_date",
      "due_date",
      "derived_status",
      "subtotal_cents",
      "tax_cents",
      "total_cents",
      "paid_cents",
      "outstanding_cents",
    ],
  },
  expenses: {
    table: "expenses",
    columns: [
      "description",
      "transaction_date",
      "payment_status",
      "paid_date",
      "tax_mode",
      "entered_cents",
      "tax_cents",
      "total_cents",
      "notes",
    ],
  },
} as const;
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") as keyof typeof exports;
  if (!Object.hasOwn(exports, kind))
    return NextResponse.json(
      { error: "Choose a supported export." },
      { status: 400 },
    );
  const { db, organization } = await workspaceContext(),
    spec = exports[kind];
  let query = db
    .from(spec.table)
    .select(spec.columns.join(","), { count: "exact", head: true })
    .eq("organization_id", organization.id);
  if (kind === "customers" || kind === "suppliers")
    query = query
      .eq("type", kind === "customers" ? "customer" : "supplier")
      .eq("archived", false);
  if (kind === "expenses") query = query.eq("archived", false);
  const count = await query;
  if (count.error)
    return NextResponse.json(
      { error: "Could not prepare export. Retry." },
      { status: 503 },
    );
  if ((count.count ?? 0) > 50000)
    return NextResponse.json(
      { error: "Please contact support for exports larger than 50,000 rows." },
      { status: 413 },
    );
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(
            "\uFEFF" +
              csvRow(spec.columns.map((c) => c.replace("_cents", "_AUD"))),
          ),
        );
        for (let offset = 0; offset < 50000; offset += 500) {
          if (request.signal.aborted) break;
          let q = db
            .from(spec.table)
            .select(spec.columns.join(","))
            .eq("organization_id", organization.id);
          if (kind === "customers" || kind === "suppliers")
            q = q
              .eq("type", kind === "customers" ? "customer" : "supplier")
              .eq("archived", false);
          if (kind === "expenses") q = q.eq("archived", false);
          const data = checked(
            await q.order("id").range(offset, offset + 499),
          ) as unknown as Record<string, unknown>[];
          for (const row of data) {
            controller.enqueue(
              encoder.encode(
                csvRow(
                  spec.columns.map((c) => {
                    const value = row[c];
                    if (c.endsWith("_cents"))
                      return decimalMoney(Number(value));
                    if (c.endsWith("_date") && typeof value === "string") {
                      const [y, m, d] = value.split("-");
                      return `${d}/${m}/${y}`;
                    }
                    return value;
                  }),
                ),
              ),
            );
          }
          if (data.length < 500) break;
        }
        controller.close();
      } catch {
        controller.error(new Error("Export interrupted. Download again."));
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finoredesk-${kind}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
