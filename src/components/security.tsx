"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { browserClient } from "@/lib/supabase/client";
import { Brand } from "./brand";
import { Field, Notice } from "./ui";
export function SecuritySetup({
  required = false,
  challenge = false,
}: {
  required?: boolean;
  challenge?: boolean;
}) {
  const router = useRouter();
  const [qr, setQr] = useState(""),
    [secret, setSecret] = useState(""),
    [factor, setFactor] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    browserClient()
      .auth.mfa.listFactors()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) {
          setError(error.message);
          return;
        }
        const verified = data.totp.find((x) => x.status === "verified");
        if (verified) setFactor(verified.id);
        setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  async function enrol() {
    setBusy(true);
    setError("");
    try {
      const db = browserClient();
      const factors = await db.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      for (const f of factors.data.all.filter(
        (x) => x.factor_type === "totp" && x.status === "unverified",
      )) {
        const removed = await db.auth.mfa.unenroll({ factorId: f.id });
        if (removed.error) throw removed.error;
      }
      const { data, error } = await db.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Finoredesk web",
        issuer: "Finoredesk",
      });
      if (error) throw error;
      setFactor(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start MFA.");
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const code = String(new FormData(e.currentTarget).get("code"));
      const { error } = await browserClient().auth.mfa.challengeAndVerify({
        factorId: factor,
        code,
      });
      if (error) throw error;
      router.push("/workspace");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="standalone">
      <div className="panel">
        <Brand />
        <div style={{ marginTop: 30 }}>
          <ShieldCheck size={32} />
          <h1>
            {factor && !qr
              ? "One more security step."
              : "Protect your workspace."}
          </h1>
          <p className="muted">
            {required
              ? "Business owners and admins use an authenticator to protect web access."
              : challenge
                ? "Enter the code from your authenticator."
                : "Set up an authenticator for your account."}
          </p>
        </div>
        {qr && (
          <>
            <img
              className="qr"
              src={qr}
              alt="Scan this QR code in your authenticator"
            />
            <details>
              <summary>Can’t scan the code?</summary>
              <p className="code">{secret}</p>
            </details>
          </>
        )}
        {!factor && (
          <button className="button" disabled={busy || !ready} onClick={enrol}>
            {busy ? <span className="spinner" /> : "Set up authenticator"}
          </button>
        )}
        {factor && (
          <form className="form-stack" onSubmit={verify}>
            <Field label="6-digit authenticator code">
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                maxLength={6}
                required
                autoFocus
              />
            </Field>
            <button className="button" disabled={busy}>
              {busy ? <span className="spinner" /> : "Verify and continue"}
            </button>
          </form>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <p className="muted" style={{ fontSize: 11, marginTop: 20 }}>
          Keep your authenticator recovery options safe. MFA enrolment applies
          to your shared Supabase account; your mobile source remains unchanged.
        </p>
      </div>
    </main>
  );
}
