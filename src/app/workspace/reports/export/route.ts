import { NextRequest, NextResponse } from "next/server";
import { report } from "@/lib/server/repository";
import { validPeriod } from "@/lib/domain/validation";
import { csvRow } from "@/lib/domain/csv";
import { decimalMoney } from "@/lib/domain/money";
export async function GET(request: NextRequest) {
  let period;
  try {
    period = validPeriod(
      request.nextUrl.searchParams.get("from") ?? "",
      request.nextUrl.searchParams.get("to") ?? "",
    );
  } catch {
    return NextResponse.json(
      { error: "Choose a valid report period." },
      { status: 400 },
    );
  }
  const r = await report(period.from, period.to);
  const content =
    csvRow(["metric", "value_AUD", "from", "to"]) +
    Object.entries(r)
      .filter(([key]) => key.endsWith("_cents"))
      .map(([key, value]) =>
        csvRow([
          key.replace("_cents", ""),
          decimalMoney(Number(value)),
          period.from,
          period.to,
        ]),
      )
      .join("");
  return new Response("\uFEFF" + content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="finoredesk-report.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
