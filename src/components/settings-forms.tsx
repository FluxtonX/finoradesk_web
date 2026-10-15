"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, Notice } from "./ui";
import { ActionButton } from "./action-button";
import {
  updateBusiness,
  inviteMember,
  updateMember,
} from "@/lib/server/access-actions";
import { updateProfile, requestDeletion } from "@/lib/server/admin-actions";
import type { Organization, Role, ActionResult } from "@/lib/domain/types";
export function BusinessSettings({
  organization,
  canAdmin,
}: {
  organization: Organization;
  canAdmin: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<ActionResult | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      setResult(
        await updateBusiness({
          name: f.get("name"),
          address: f.get("address"),
          reporting_basis: f.get("basis"),
        }),
      );
    } catch {
      setResult({ ok: false, message: "Could not save. Please retry." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={submit}>
      <h2>Business details</h2>
      <div className="form-stack">
        <Field label="Business name">
          <input
            name="name"
            defaultValue={organization.name}
            maxLength={160}
            required
            disabled={!canAdmin}
          />
        </Field>
        <Field label="Address">
          <textarea
            name="address"
            defaultValue={organization.address}
            maxLength={2000}
            disabled={!canAdmin}
          />
        </Field>
        <Field label="Reporting preference">
          <select
            name="basis"
            defaultValue={organization.reporting_basis}
            disabled={!canAdmin}
          >
            <option value="accrual">Accrual preference</option>
            <option value="cash">Cash preference</option>
          </select>
          <small>
            Reports retain explicit issue, expense and payment-date labels.
          </small>
        </Field>
        <small>
          ABN {organization.abn || "not recorded"} ·{" "}
          {organization.gst_registered
            ? "GST registered"
            : "Not GST registered"}{" "}
          · {organization.timezone}
        </small>
        {canAdmin && (
          <button className="button" disabled={busy}>
            {busy ? <span className="spinner" /> : "Save business"}
          </button>
        )}
        {result && (
          <Notice tone={result.ok ? "success" : "error"}>
            {result.message}
          </Notice>
        )}
      </div>
    </form>
  );
}
export function ProfileSettings({
  name,
  reminders,
}: {
  name: string;
  reminders: boolean;
}) {
  const [result, setResult] = useState<ActionResult | null>(null),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      setResult(
        await updateProfile({
          name: f.get("name"),
          reminders: f.get("reminders") === "on",
        }),
      );
    } catch {
      setResult({ ok: false, message: "Could not save. Retry." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={submit}>
      <h2>Your preferences</h2>
      <div className="form-stack">
        <Field label="Display name">
          <input name="name" maxLength={120} defaultValue={name} />
        </Field>
        <label className="checkbox">
          <input type="checkbox" name="reminders" defaultChecked={reminders} />
          Prefer invoice reminder notifications
        </label>
        <small>
          Preferences do not enable delivery or replace invoice-level consent.
        </small>
        <Link className="text-link" href="/security">
          Authenticator security
        </Link>
        <button className="button button-secondary" disabled={busy}>
          {busy ? <span className="spinner" /> : "Save preferences"}
        </button>
        {result && (
          <Notice tone={result.ok ? "success" : "error"}>
            {result.message}
          </Notice>
        )}
      </div>
    </form>
  );
}
export function TeamSettings({
  members,
  canAdmin,
  invitations,
}: {
  members: { user_id: string; role: Role; active: boolean }[];
  canAdmin: boolean;
  invitations: {
    id: string;
    email: string;
    role: string;
    expires_at: string;
    accepted_at: string | null;
  }[];
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null),
    [busy, setBusy] = useState(false);
  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const r = await inviteMember({
        email: f.get("email"),
        role: f.get("role"),
      });
      setResult(r);
      router.refresh();
    } catch {
      setResult({ ok: false, message: "Could not invite. Please retry." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>A workspace, shared.</h2>
      <p className="muted">Roles control access to this business.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Member ID</th>
              <th>Role</th>
              <th>Access</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}>
                <td title={m.user_id}>{m.user_id.slice(0, 8)}…</td>
                <td>{m.role}</td>
                <td>{m.active ? "Active" : "Removed"}</td>
                <td>
                  {canAdmin && m.role !== "owner" && (
                    <div className="actions">
                      <select
                        className="control"
                        aria-label={`Role for ${m.user_id}`}
                        value={m.role}
                        onChange={async (e) => {
                          setResult(
                            await updateMember({
                              user: m.user_id,
                              role: e.target.value,
                              active: m.active,
                            }),
                          );
                          router.refresh();
                        }}
                      >
                        {["admin", "member", "viewer"].map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                      <ActionButton
                        action={() =>
                          updateMember({
                            user: m.user_id,
                            role: m.role,
                            active: !m.active,
                          })
                        }
                        confirm={`${m.active ? "Remove" : "Restore"} this member’s business access?`}
                        className="button button-secondary button-small"
                      >
                        {m.active ? "Remove" : "Restore"}
                      </ActionButton>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canAdmin && (
        <>
          <hr className="divider" />
          <form className="form-stack" onSubmit={invite}>
            <div className="field-grid">
              <Field label="Invite email">
                <input name="email" type="email" required />
              </Field>
              <Field label="Role">
                <select name="role">
                  <option value="member">Member · edit records</option>
                  <option value="viewer">Viewer · read only</option>
                  <option value="admin">Admin · manage business</option>
                </select>
              </Field>
            </div>
            <button className="button" disabled={busy}>
              {busy ? <span className="spinner" /> : "Create invitation link"}
            </button>
          </form>
          {result && (
            <Notice tone={result.ok ? "success" : "error"}>
              {result.message}
              {result.url && (
                <div>
                  <button
                    className="button button-secondary button-small"
                    style={{ marginTop: 10 }}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `${window.location.origin}${result.url}`,
                        );
                        setResult({
                          ...result,
                          message:
                            "Invitation link copied. Share it with the invited person.",
                        });
                      } catch {
                        setResult({
                          ...result,
                          message:
                            "Copy unavailable. Use the invitation link below.",
                        });
                      }
                    }}
                  >
                    Copy invitation link
                  </button>
                  <p className="code" style={{ marginTop: 10 }}>
                    {result.url}
                  </p>
                </div>
              )}
            </Notice>
          )}
          <p className="muted" style={{ fontSize: 11, marginTop: 15 }}>
            No invitation email is sent automatically. Links expire after seven
            days and require the invited verified email.
          </p>
          {invitations.length > 0 && (
            <details>
              <summary>Invitation history</summary>
              {invitations.map((i) => (
                <p key={i.id} style={{ fontSize: 12, marginTop: 10 }}>
                  {i.email} · {i.role} ·{" "}
                  {i.accepted_at
                    ? "Accepted"
                    : `Expires ${i.expires_at.slice(0, 10)}`}
                </p>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}
export function PrivacySettings() {
  return (
    <section className="panel">
      <h2>Your data, your options.</h2>
      <p className="muted">
        Export business records or ask for a deletion review.
      </p>
      <div className="actions">
        <a
          className="button button-secondary"
          href="/workspace/settings/export"
        >
          Download business JSON
        </a>
        <ActionButton
          action={requestDeletion}
          confirm="Request a deletion review for this business? Records will remain until ownership and retention requirements are reviewed."
          className="button button-danger"
        >
          Request deletion review
        </ActionButton>
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 15 }}>
        JSON includes receipt metadata. Original receipt files remain available
        through authorised private previews. Retention and deletion terms
        require final business review.
      </p>
    </section>
  );
}
