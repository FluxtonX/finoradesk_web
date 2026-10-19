"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { browserClient } from "@/lib/supabase/client";
import { publicConfig, safeNext } from "@/lib/config";
import { Brand } from "./brand";
import { Field, Notice } from "./ui";

export function AuthForm({
  mode = "signin",
  next = "/workspace",
  initialError = "",
}: {
  mode?: string;
  next?: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(initialError),
    [show, setShow] = useState(false);
  const signUp = mode === "signup",
    forgot = mode === "forgot",
    verify = mode === "verify",
    password = mode === "password";
  const title = signUp
    ? "Your business, a little clearer."
    : forgot
      ? "Let’s get you back in."
      : verify
        ? "Check your inbox."
        : password
          ? "A fresh password."
          : "Welcome back.";
  const subtitle = signUp
    ? "Create your Finoredesk account."
    : forgot
      ? "We’ll send a secure password reset link."
      : verify
        ? "Verify your email before opening your workspace."
        : password
          ? "Choose a new password for your account."
          : "A clearer view of your business starts here.";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const form = new FormData(event.currentTarget),
      email = String(form.get("email") ?? ""),
      pw = String(form.get("password") ?? "");
    try {
      const db = browserClient();
      if (signUp) {
        if (pw !== form.get("confirm"))
          throw new Error("Passwords do not match.");
        const { data, error } = await db.auth.signUp({
          email,
          password: pw,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
            data: { display_name: String(form.get("name") ?? "") },
          },
        });
        if (error) throw error;
        if (data.session) {
          router.push("/onboarding");
          router.refresh();
        } else
          setMessage(
            "Check your inbox to verify your email. If you already have an account, sign in.",
          );
      } else if (forgot) {
        const { error } = await db.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/password`,
        });
        if (error) throw error;
        setMessage("If that email has an account, a reset link is on its way.");
      } else if (verify) {
        const { error } = await db.auth.resend({
          type: "signup",
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
          },
        });
        if (error) throw error;
        setMessage("Verification requested. Check your inbox.");
      } else if (password) {
        if (pw !== form.get("confirm"))
          throw new Error("Passwords do not match.");
        const { data: assurance, error: assuranceError } =
          await db.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceError) throw assuranceError;
        if (!assurance?.currentLevel)
          throw new Error(
            "Your session has expired. Please request a new reset link.",
          );
        if (
          assurance.nextLevel === "aal2" &&
          assurance.currentLevel !== "aal2"
        ) {
          router.replace("/security?challenge=1&next=/auth/password");
          router.refresh();
          return;
        }
        const { error } = await db.auth.updateUser({ password: pw });
        if (error) throw error;
        setMessage("Password updated.");
        router.push("/workspace");
        router.refresh();
      } else {
        const { error } = await db.auth.signInWithPassword({
          email,
          password: pw,
        });
        if (error) throw error;
        router.push(safeNext(next));
        router.refresh();
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not connect. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand light />
        <div className="auth-story-main">
          <span className="pill">MADE FOR YOUR EVERYDAY BUSINESS</span>
          <h2>
            Less admin.
            <br />
            More <em>possibility.</em>
          </h2>
          <p>
            A calm place for your invoices, expenses and the bigger picture.
          </p>
          <div className="story-illustration" aria-hidden="true">
            <div className="story-paper">
              <small>Organised, together.</small>
              <div className="paper-line" />
              <div className="paper-line" />
            </div>
            <div className="story-paper">
              <small>Your next chapter</small>
              <p />
              <strong>Room to grow.</strong>
              <div className="paper-line" />
            </div>
          </div>
        </div>
        <div className="auth-story-footer">
          <span>Built for Australian small business</span>
          <span>Finoredesk © {new Date().getFullYear()}</span>
        </div>
      </aside>
      <main id="main" className="auth-form-area">
        <div className="auth-form">
          <span className="eyebrow">YOUR BUSINESS, IN GOOD ORDER</span>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
          {!publicConfig() && (
            <Notice tone="error">
              Connection setup is needed. Add web/.env.local using
              web/.env.example.
            </Notice>
          )}
          <form className="form-stack" onSubmit={submit}>
            {signUp && (
              <Field label="Your name">
                <input
                  name="name"
                  autoComplete="name"
                  maxLength={120}
                  required
                  placeholder="Full name"
                />
              </Field>
            )}
            {!password && (
              <Field label="Email address">
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  placeholder="you@yourbusiness.com.au"
                  maxLength={254}
                />
              </Field>
            )}
            {!forgot && !verify && (
              <Field
                label="Password"
                hint={
                  signUp || password ? "At least 12 characters." : undefined
                }
              >
                <div style={{ position: "relative" }}>
                  <input
                    type={show ? "text" : "password"}
                    name="password"
                    autoComplete={
                      signUp || password ? "new-password" : "current-password"
                    }
                    required
                    minLength={signUp || password ? 12 : 1}
                    maxLength={128}
                    style={{ paddingRight: 48 }}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    style={{
                      position: "absolute",
                      right: 5,
                      top: 4,
                      border: 0,
                    }}
                    aria-label={show ? "Hide password" : "Show password"}
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </Field>
            )}
            {(signUp || password) && (
              <Field label="Confirm password">
                <input
                  type={show ? "text" : "password"}
                  name="confirm"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </Field>
            )}
            {!signUp && !forgot && !verify && !password && (
              <div className="auth-mini-nav">
                <span>Secure email sign-in</span>
                <Link href="/auth?mode=forgot" className="text-link">
                  Forgot password?
                </Link>
              </div>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            {message && <Notice tone="success">{message}</Notice>}
            <button className="button" disabled={busy || !publicConfig()}>
              {busy ? (
                <>
                  <span className="spinner" />
                  Please wait
                </>
              ) : (
                <>
                  {signUp
                    ? "Create account"
                    : forgot
                      ? "Send reset link"
                      : verify
                        ? "Resend verification"
                        : password
                          ? "Update password"
                          : "Sign in"}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
          {signUp && message && (
            <div className="auth-switch">
              <Link href="/auth?mode=verify">Resend verification</Link>
            </div>
          )}
          {(forgot || verify || password) && (
            <div className="auth-switch">
              <Link href="/auth?mode=signin">Back to sign in</Link>
            </div>
          )}
          <div className="auth-switch">
            {signUp ? (
              <>
                Already have an account?{" "}
                <Link href="/auth?mode=signin">Sign in</Link>
              </>
            ) : (
              <>
                New to Finoredesk?{" "}
                <Link href="/auth?mode=signup">Create an account</Link>
              </>
            )}
          </div>
          <div className="auth-switch">
            <Link href="/">Back to Finoredesk</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
