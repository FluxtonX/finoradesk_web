"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "./brand";
import { Field, Notice } from "./ui";
import { createBusiness, acceptInvite } from "@/lib/server/access-actions";
export function BusinessOnboarding({ invite }: { invite?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = invite
        ? await acceptInvite(invite)
        : await createBusiness({
            name: f.get("name"),
            abn: f.get("abn"),
            address: f.get("address"),
            timezone: f.get("timezone"),
            gst: f.get("gst") === "on",
          });
      if (!r.ok) setError(r.message);
      else {
        router.push("/workspace");
        router.refresh();
      }
    } catch {
      setError("Connection interrupted. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="standalone">
      <div className="panel" style={{ maxWidth: 600 }}>
        <Brand />
        <div style={{ marginTop: 28 }}>
          <span className="eyebrow">A GOOD PLACE TO START</span>
          <h1>{invite ? "Join your team." : "Make room for your business."}</h1>
          <p className="muted">
            {invite
              ? "Accept this invitation with the verified email it was sent to."
              : "A few details, then you’re ready to get organised."}
          </p>
        </div>
        <form className="form-stack" onSubmit={submit}>
          {!invite && (
            <>
              <Field label="Business name">
                <input
                  name="name"
                  required
                  maxLength={160}
                  autoComplete="organization"
                />
              </Field>
              <div className="field-grid">
                <Field label="ABN (optional)" hint="Checksum validation only.">
                  <input name="abn" inputMode="numeric" maxLength={20} />
                </Field>
                <Field label="Business timezone">
                  <select name="timezone">
                    {[
                      "Sydney",
                      "Melbourne",
                      "Brisbane",
                      "Adelaide",
                      "Perth",
                      "Darwin",
                      "Hobart",
                    ].map((c) => (
                      <option value={`Australia/${c}`} key={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Business address">
                <textarea
                  name="address"
                  maxLength={2000}
                  autoComplete="street-address"
                />
              </Field>
              <label className="checkbox">
                <input name="gst" type="checkbox" />
                Registered for GST
              </label>
              <small>AUD · Australian business administration</small>
            </>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <button className="button" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" />
                Saving…
              </>
            ) : invite ? (
              "Accept invitation"
            ) : (
              "Create workspace"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
