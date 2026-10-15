"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/domain/types";
import { Notice } from "./ui";
export function ActionButton({
  children,
  action,
  confirm,
  className = "button button-secondary",
  redirect,
}: {
  children: React.ReactNode;
  action: () => Promise<ActionResult>;
  confirm?: string;
  className?: string;
  redirect?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<ActionResult | null>(null),
    [confirming, setConfirming] = useState(false);
  async function run() {
    if (confirm && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await action();
      setResult(r);
      if (r.ok) {
        setConfirming(false);
        if (redirect) router.push(redirect);
        router.refresh();
      }
    } catch {
      setResult({
        ok: false,
        message: "Connection interrupted. Please retry.",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {confirming && (
        <Notice>
          {confirm}
          <div className="actions" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="button button-small"
              disabled={busy}
              onClick={run}
            >
              Confirm
            </button>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => setConfirming(false)}
            >
              Keep editing
            </button>
          </div>
        </Notice>
      )}
      {!confirming && (
        <button
          type="button"
          className={className}
          onClick={run}
          disabled={busy}
        >
          {busy ? <span className="spinner" /> : children}
        </button>
      )}
      {result && (
        <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>
      )}
    </div>
  );
}
