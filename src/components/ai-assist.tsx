"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { requestAi, reviewAi } from "@/lib/server/ai-actions";
import { Field, Notice } from "./ui";
import type { Suggestion, Category } from "@/lib/domain/types";
export function AiAssist({
  kind,
  targetId,
  period,
  categories = [],
  onApproved,
}: {
  kind: "invoice" | "category" | "report";
  targetId?: string;
  period?: { from: string; to: string };
  categories?: Category[];
  onApproved?: (text: string) => void;
}) {
  const router = useRouter();
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [suggestion, setSuggestion] = useState<Suggestion | null>(null),
    [text, setText] = useState(""),
    [category, setCategory] = useState(""),
    [message, setMessage] = useState("");
  async function generate() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await requestAi({
        kind,
        target_id: targetId,
        date_from: period?.from,
        date_to: period?.to,
        consent,
      });
      if (!r.ok) setError(r.message);
      else if (r.suggestion) {
        setSuggestion(r.suggestion);
        setText(r.suggestion.text);
        setCategory(r.suggestion.category_id ?? "");
      }
    } catch {
      setError("Could not reach AI. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function review(decision: "accepted" | "edited" | "dismissed") {
    if (!suggestion) return;
    setBusy(true);
    setError("");
    try {
      const r = await reviewAi({
        id: suggestion.id,
        decision,
        text,
        category: category || undefined,
      });
      if (!r.ok) setError(r.message);
      else {
        setMessage(
          decision === "dismissed"
            ? r.message
            : kind === "invoice"
              ? "Reviewed wording is ready in your draft. Save the draft to retain it."
              : r.message,
        );
        if (r.text && decision !== "dismissed") onApproved?.(r.text);
        setSuggestion(null);
        router.refresh();
      }
    } catch {
      setError("Could not save your review. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ marginTop: 22 }}>
      <h3>
        <Sparkles
          size={16}
          style={{ verticalAlign: "middle", marginRight: 6 }}
        />
        A little writing help
      </h3>
      <p className="muted" style={{ fontSize: 12 }}>
        {kind === "category"
          ? "Suggest a category from the saved description. Receipt images are not extracted."
          : kind === "report"
            ? "Explain computed report metrics. Suggestions cannot change the source numbers."
            : "Suggest wording from your saved draft descriptions."}
      </p>
      {!suggestion ? (
        <>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Allow the minimum record context to be sent to the configured AI
            provider.
          </label>
          <button
            className="button button-secondary button-small"
            disabled={!consent || busy}
            style={{ marginTop: 13 }}
            onClick={generate}
          >
            {busy ? <span className="spinner" /> : "Request suggestion"}
          </button>
        </>
      ) : (
        <>
          <Notice>
            Suggested · AI can be wrong. Review before saving.
            {suggestion.confidence != null &&
              ` Confidence ${Math.round(suggestion.confidence * 100)}%.`}
          </Notice>
          <Field label="Review or edit suggestion">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={4000}
            />
          </Field>
          {kind === "category" && (
            <Field label="Reviewed category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="toolbar">
            <button
              className="button button-small"
              disabled={busy}
              onClick={() =>
                review(
                  text === suggestion.text &&
                    category === (suggestion.category_id ?? "")
                    ? "accepted"
                    : "edited",
                )
              }
            >
              Accept reviewed suggestion
            </button>
            <button
              className="button button-secondary button-small"
              disabled={busy}
              onClick={() => review("dismissed")}
            >
              Dismiss
            </button>
          </div>
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
    </div>
  );
}
