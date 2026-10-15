"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWriter } from "./context";
import { checked, errorMessage } from "./errors";
import { uuid } from "@/lib/domain/validation";
import { COLUMNS, validateImport, type ImportKind } from "@/lib/domain/csv";
export async function importCsv(input: unknown) {
  try {
    const data = z
      .object({
        kind: z.enum(["customers", "suppliers", "expenses"]),
        rows: z
          .array(z.array(z.string().max(10000)))
          .min(2)
          .max(1001),
        mapping: z.record(z.string(), z.string()),
        key: uuid,
      })
      .parse(input);
    if (JSON.stringify(data).length > 2 * 1024 * 1024)
      throw new Error("Import is too large.");
    const preview = validateImport(data.kind, data.rows, data.mapping);
    if (preview.errors.length)
      throw new Error(
        `Fix ${preview.errors.length} invalid rows before importing.`,
      );
    const { db, organization } = await requireWriter();
    const result = checked(
      await db.rpc("apply_import", {
        org: organization.id,
        import_kind: data.kind,
        rows: preview.values,
        idempotency_key: data.key,
      }),
    ) as { id: string; imported: number; duplicates: number; errors: number };
    const rowErrors =
      checked(
        await db
          .from("import_job_rows")
          .select("row_number,status,error")
          .eq("organization_id", organization.id)
          .eq("job_id", result.id)
          .eq("status", "error")
          .order("row_number"),
      ) ?? [];
    revalidatePath("/workspace", "layout");
    return {
      ok: true,
      message: `${result.imported} imported · ${result.duplicates} existing duplicates · ${preview.duplicates} repeated file rows · ${result.errors} rejected`,
      errors: rowErrors,
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e), errors: [] };
  }
}
