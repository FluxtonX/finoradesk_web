"use client";
import { useState } from "react";
import {
  COLUMNS,
  parseCsv,
  validateImport,
  csvRow,
  type ImportKind,
} from "@/lib/domain/csv";
import { importCsv } from "@/lib/server/transfer-actions";
import { Field, Notice } from "./ui";
export function CsvTransfer({ canWrite }: { canWrite: boolean }) {
  const [kind, setKind] = useState<ImportKind>("customers"),
    [rows, setRows] = useState<string[][]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [serverErrors, setServerErrors] = useState<
      { row_number: number; error: string }[]
    >([]);
  const preview = rows.length ? validateImport(kind, rows, mapping) : null;
  async function file(e: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    setMessage("");
    setRows([]);
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      if (f.size > 2 * 1024 * 1024) throw new Error("Choose a CSV up to 2 MB.");
      const parsed = parseCsv(await f.text());
      setRows(parsed);
      setMapping(
        Object.fromEntries(
          COLUMNS[kind].map((c) => [
            c,
            parsed[0].find((h) => h.trim().toLowerCase() === c) ?? "",
          ]),
        ),
      );
      setKey(crypto.randomUUID());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read file.");
    }
  }
  async function apply() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await importCsv({ kind, rows, mapping, key });
      if (r.ok) {
        setMessage(r.message);
        setServerErrors(r.errors as { row_number: number; error: string }[]);
      } else setError(r.message);
    } catch {
      setError("Connection interrupted. Retry this import safely.");
    } finally {
      setBusy(false);
    }
  }
  function template() {
    const blob = new Blob([csvRow(COLUMNS[kind])], {
        type: "text/csv;charset=utf-8",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `${kind}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="panel">
        <h2>Import your existing records.</h2>
        <p className="muted">
          Preview, map and validate before saving. Up to 1,000 rows / 2 MB per
          file.
        </p>
        <div className="field-grid">
          <Field label="Record type">
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as ImportKind);
                setRows([]);
                setMessage("");
                setServerErrors([]);
              }}
            >
              <option value="customers">Customers</option>
              <option value="suppliers">Suppliers</option>
              <option value="expenses">Expenses</option>
            </select>
          </Field>
          <Field label="CSV file">
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={!canWrite}
              onChange={file}
              key={kind}
            />
          </Field>
        </div>
        <div className="toolbar">
          <button className="text-link" onClick={template}>
            Download blank template
          </button>
        </div>
        {rows.length > 0 && (
          <>
            <hr className="divider" />
            <h3>Match your columns</h3>
            <div className="field-grid">
              {COLUMNS[kind].map((column) => (
                <Field label={column.replaceAll("_", " ")} key={column}>
                  <select
                    value={mapping[column] ?? ""}
                    onChange={(e) => {
                      setMapping({ ...mapping, [column]: e.target.value });
                      setKey(crypto.randomUUID());
                      setMessage("");
                    }}
                  >
                    <option value="">Not mapped / default</option>
                    {rows[0].map((h) => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <Notice>
              {preview?.values.length} valid · {preview?.duplicates} repeated ·{" "}
              {preview?.errors.length} invalid
            </Notice>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {rows[0].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(1, 6).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview?.errors.slice(0, 10).map((e) => (
              <Notice tone="error" key={e.row}>
                Row {e.row}: {e.message}
              </Notice>
            ))}
            <div className="toolbar">
              <button
                className="button"
                disabled={
                  busy ||
                  !canWrite ||
                  !!preview?.errors.length ||
                  !preview?.values.length
                }
                onClick={apply}
              >
                {busy ? <span className="spinner" /> : "Confirm import"}
              </button>
            </div>
          </>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice tone="success">{message}</Notice>}
        {serverErrors.map((e) => (
          <Notice tone="error" key={e.row_number}>
            Processed row {e.row_number}: {e.error}
          </Notice>
        ))}
      </div>
      <div className="panel">
        <h2>Your records, ready to take with you.</h2>
        <p className="muted">
          Export saved records as CSV. Files use AUD amounts and Australian date
          formatting.
        </p>
        <div className="actions">
          {["customers", "suppliers", "invoices", "expenses"].map((kind) => (
            <a
              key={kind}
              className="button button-secondary"
              href={`/workspace/transfer/export?kind=${kind}`}
            >
              Export {kind}
            </a>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 15 }}>
          Large exports are bounded to 50,000 rows. Contact support for a larger
          migration.
        </p>
      </div>
    </>
  );
}
