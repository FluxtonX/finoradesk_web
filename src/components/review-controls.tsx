"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "./action-button";
import {
  requestReview,
  decideReview,
  approvalPolicy,
} from "@/lib/server/review-actions";
import { Field, Notice } from "./ui";
export function RequestReview({
  kind,
  id,
}: {
  kind: "invoice" | "expense";
  id: string;
}) {
  return (
    <ActionButton
      action={() => requestReview({ kind, id })}
      confirm="Request a different business admin to review the current saved version?"
    >
      Request review
    </ActionButton>
  );
}
export function ReviewDecision({ id }: { id: string }) {
  const [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<{ ok: boolean; message: string } | null>(
      null,
    );
  const router = useRouter();
  async function act(decision: "approved" | "rejected") {
    setBusy(true);
    try {
      setResult(await decideReview({ id, decision, note }));
      router.refresh();
    } catch {
      setResult({ ok: false, message: "Could not save the review. Retry." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Field label="Review note">
        <textarea
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="toolbar">
        <button
          className="button button-small"
          disabled={busy}
          onClick={() => act("approved")}
        >
          Approve saved version
        </button>
        <button
          className="button button-secondary button-small"
          disabled={busy}
          onClick={() => act("rejected")}
        >
          Request correction
        </button>
      </div>
      {result && (
        <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>
      )}
    </>
  );
}
export function ApprovalPolicy({ required }: { required: boolean }) {
  return (
    <ActionButton
      action={() => approvalPolicy(!required)}
      confirm={
        required
          ? "Disable approval before invoice issue?"
          : "Require a different admin to approve each invoice before web issue? Two active admins are required."
      }
    >
      {required
        ? "Disable invoice approval policy"
        : "Require invoice approval"}
    </ActionButton>
  );
}
