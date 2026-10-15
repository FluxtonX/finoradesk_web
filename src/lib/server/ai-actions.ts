"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWriter } from "./context";
import { checked, errorMessage } from "./errors";
import { uuid, dateOnly } from "@/lib/domain/validation";
import type { Suggestion } from "@/lib/domain/types";
export async function requestAi(
  input: unknown,
): Promise<{ ok: boolean; message: string; suggestion?: Suggestion }> {
  try {
    const data = z
      .object({
        kind: z.enum(["invoice", "category", "report"]),
        target_id: uuid.optional(),
        date_from: dateOnly.optional(),
        date_to: dateOnly.optional(),
        consent: z.literal(true),
      })
      .parse(input);
    if (data.kind !== "report" && !data.target_id)
      throw new Error("Save the record before requesting a suggestion.");
    const { db, organization } = await requireWriter();
    const result = await db.functions.invoke("ai-assist", {
      body: { ...data, org: organization.id },
    });
    if (result.error) {
      const context = result.error.context;
      if (context instanceof Response) {
        const body = await context.json().catch(() => null);
        throw new Error(
          body?.error ?? "AI is unavailable. Your records still work.",
        );
      }
      throw new Error("AI is unavailable. Your records still work.");
    }
    const suggestion = z
      .object({
        id: uuid,
        kind: z.enum(["invoice", "category", "report"]),
        text: z.string().min(1).max(4000),
        category_id: uuid.nullable().optional(),
        confidence: z.number().nullable().optional(),
        state: z.string(),
      })
      .parse(result.data);
    return {
      ok: true,
      message: "Review before accepting.",
      suggestion: suggestion as Suggestion,
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function reviewAi(input: unknown) {
  try {
    const data = z
      .object({
        id: uuid,
        decision: z.enum(["accepted", "edited", "dismissed"]),
        text: z.string().max(4000).optional(),
        category: uuid.optional(),
      })
      .parse(input);
    const { db, organization } = await requireWriter();
    const text = checked(
      await db.rpc("review_suggestion", {
        org: organization.id,
        suggestion: data.id,
        decision: data.decision,
        edited_text: data.text ?? null,
        chosen_category: data.category ?? null,
      }),
    );
    revalidatePath("/workspace", "layout");
    return {
      ok: true,
      message:
        data.decision === "dismissed"
          ? "Suggestion dismissed. Records unchanged."
          : "Suggestion reviewed.",
      text: text as string | null,
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e), text: null };
  }
}
