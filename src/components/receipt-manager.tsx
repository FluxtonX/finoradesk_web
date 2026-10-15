"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload, ExternalLink } from "lucide-react";
import { browserClient } from "@/lib/supabase/client";
import { Field, Notice, EmptyState, DateLabel } from "./ui";
import type { Receipt } from "@/lib/domain/types";
const TYPES = ["image/jpeg", "image/png", "application/pdf"];
export function ReceiptManager({
  org,
  receipts,
  expenseId,
  canWrite,
}: {
  org: string;
  receipts: Receipt[];
  expenseId?: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [progress, setProgress] = useState(""),
    [link, setLink] = useState<Record<string, string>>({}),
    [matches, setMatches] = useState<{ id: string; description: string }[]>([]),
    [search, setSearch] = useState("");
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const form = e.currentTarget,
      file = new FormData(form).get("file");
    let objectPath = "";
    try {
      if (
        !(file instanceof File) ||
        !TYPES.includes(file.type) ||
        file.size <= 0 ||
        file.size > 10485760
      )
        throw new Error("Choose a JPEG, PNG or PDF up to 10 MB.");
      const db = browserClient(),
        id = crypto.randomUUID();
      const safeName =
        file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "receipt";
      objectPath = `${org}/${id}/${safeName}`;
      setProgress("Uploading receipt…");
      const uploaded = await db.storage
        .from("receipts")
        .upload(objectPath, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw uploaded.error;
      setProgress("Saving attachment…");
      const saved = await db.rpc("register_receipt", {
        org,
        receipt_id: id,
        path: objectPath,
        original_name: file.name,
        content_type: file.type,
        bytes: file.size,
        linked_expense: expenseId ?? null,
      });
      if (saved.error) throw saved.error;
      setMessage("Receipt saved privately.");
      form.reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please retry.");
      if (objectPath)
        await browserClient().storage.from("receipts").remove([objectPath]);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  async function preview(receipt: Receipt) {
    setError("");
    const windowRef = window.open("about:blank", "_blank");
    if (windowRef) windowRef.opener = null;
    try {
      const { data, error } = await browserClient()
        .storage.from("receipts")
        .createSignedUrl(receipt.object_path, 60);
      if (error) throw error;
      if (windowRef) windowRef.location.href = data.signedUrl;
      else setError("Allow pop-ups to preview this receipt.");
    } catch {
      windowRef?.close();
      setError("Could not open receipt. Please retry.");
    }
  }
  async function findExpenses() {
    setError("");
    const term = search
      .replace(/[\\%_(),.*:]/g, " ")
      .trim()
      .slice(0, 100);
    const { data, error } = await browserClient()
      .from("expenses")
      .select("id,description")
      .eq("organization_id", org)
      .eq("archived", false)
      .ilike("description", `%${term}%`)
      .order("transaction_date", { ascending: false })
      .limit(25);
    if (error) setError("Could not search expenses.");
    else setMatches(data ?? []);
  }
  async function attach(receipt: Receipt, id: string) {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await browserClient()
        .from("receipts")
        .update({ expense_id: id || null })
        .eq("organization_id", org)
        .eq("id", receipt.id)
        .select("id")
        .single();
      if (error || !data) throw new Error("Could not update attachment.");
      router.refresh();
      setMessage(id ? "Receipt linked." : "Receipt unlinked.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update receipt.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {canWrite && (
        <form className="upload-zone" onSubmit={upload}>
          <Upload size={25} />
          <h3 style={{ marginTop: 12 }}>Keep the receipt, lose the clutter.</h3>
          <p className="muted" style={{ fontSize: 12 }}>
            JPEG, PNG or PDF · Up to 10 MB · Private to your business
          </p>
          <input
            name="file"
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            required
            aria-label="Choose receipt file"
          />
          <button
            className="button button-small"
            style={{ marginTop: 15 }}
            disabled={busy}
          >
            {busy ? (
              <>
                <span className="spinner" />
                {progress || "Saving…"}
              </>
            ) : (
              "Upload receipt"
            )}
          </button>
        </form>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {receipts.length ? (
        <>
          <div className="receipt-grid" style={{ marginTop: 20 }}>
            {receipts.map((r) => (
              <article className="receipt-card" key={r.id}>
                <FileText size={25} />
                <h3 style={{ marginTop: 15 }}>{r.filename}</h3>
                <small>
                  <DateLabel value={r.created_at} /> ·{" "}
                  {(r.size_bytes / 1024).toFixed(0)} KB
                </small>
                <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                  {r.expense_id
                    ? "Linked to an expense"
                    : "Not linked to an expense"}
                </p>
                <div className="actions">
                  <button
                    className="button button-secondary button-small"
                    onClick={() => preview(r)}
                  >
                    <ExternalLink size={13} />
                    Preview
                  </button>
                  {canWrite && r.expense_id && (
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() => attach(r, "")}
                    >
                      Unlink
                    </button>
                  )}
                  {canWrite && expenseId && r.expense_id !== expenseId && (
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() => attach(r, expenseId)}
                    >
                      Link here
                    </button>
                  )}
                </div>
                {canWrite && !expenseId && (
                  <div className="form-stack" style={{ marginTop: 15, gap: 8 }}>
                    <select
                      className="control"
                      value={link[r.id] ?? ""}
                      onChange={(e) =>
                        setLink({ ...link, [r.id]: e.target.value })
                      }
                      aria-label={`Expense for ${r.filename}`}
                    >
                      <option value="">Select searched expense</option>
                      {matches.map((e) => (
                        <option value={e.id} key={e.id}>
                          {e.description}
                        </option>
                      ))}
                    </select>
                    <button
                      className="button button-secondary button-small"
                      disabled={busy || !link[r.id]}
                      onClick={() => attach(r, link[r.id])}
                    >
                      Link to expense
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
          {canWrite && !expenseId && (
            <div className="toolbar">
              <input
                className="control"
                style={{ maxWidth: 350 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find an expense to link"
                aria-label="Search expenses for attachment"
              />
              <button
                className="button button-secondary"
                onClick={findExpenses}
              >
                Find expenses
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title="A clean slate for your receipts."
          description="Your uploaded documents will appear here."
          kind="receipts"
        />
      )}
    </>
  );
}
