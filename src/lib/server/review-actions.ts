"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWriter, requireAdmin } from "./context";
import { checked, errorMessage } from "./errors";
import { uuid } from "@/lib/domain/validation";
import type { ActionResult } from "@/lib/domain/types";
export async function requestReview(input: unknown): Promise<ActionResult> {
  try {
    const d = z
      .object({ kind: z.enum(["invoice", "expense"]), id: uuid })
      .parse(input);
    const { db, organization } = await requireWriter();
    const id = checked(
      await db.rpc("request_web_review", {
        org: organization.id,
        kind: d.kind,
        record: d.id,
      }),
    );
    revalidatePath("/workspace", "layout");
    return {
      ok: true,
      message: "Review requested for this saved version.",
      id: String(id),
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function decideReview(input: unknown): Promise<ActionResult> {
  try {
    const d = z
      .object({
        id: uuid,
        decision: z.enum(["approved", "rejected"]),
        note: z.string().max(2000),
      })
      .parse(input);
    const { db, organization } = await requireAdmin();
    checked(
      await db.rpc("decide_web_review", {
        org: organization.id,
        review: d.id,
        decision: d.decision,
        review_note: d.note,
      }),
    );
    revalidatePath("/workspace", "layout");
    return { ok: true, message: `Record ${d.decision}.` };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
export async function approvalPolicy(required: boolean): Promise<ActionResult> {
  try {
    z.boolean().parse(required);
    const { db, organization } = await requireAdmin();
    checked(
      await db.rpc("set_web_approval_policy", {
        org: organization.id,
        required,
      }),
    );
    revalidatePath("/workspace", "layout");
    return {
      ok: true,
      message: required
        ? "Approval is required before web invoice issue."
        : "Approval requirement disabled.",
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
