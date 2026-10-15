import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { invoiceDetail } from "@/lib/server/repository";
import { buildInvoicePdf } from "@/lib/domain/invoice-pdf";
import { uuid } from "@/lib/domain/validation";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!uuid.safeParse(id).success)
    return NextResponse.json(
      { error: "Invoice unavailable." },
      { status: 404 },
    );
  const { invoice, lines } = await invoiceDetail(id);
  if (invoice.state === "draft")
    return NextResponse.json(
      { error: "Issue the invoice first." },
      { status: 400 },
    );
  const bytes = await buildInvoicePdf(
    invoice,
    lines,
    await readFile(
      path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf"),
    ),
  );
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number ?? "invoice"}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
