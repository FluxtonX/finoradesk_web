import { z } from "zod";
import { money } from "./money";
import type { Invoice } from "./types";
export type EmailMode = "disabled" | "test" | "live";
export interface EmailConfig {
  mode: EmailMode;
  apiKey: string;
  sender: { name: string; email: string };
  replyTo?: { email: string };
  allowlist: string[];
}
export function emailConfig(
  env: Record<string, string | undefined>,
): EmailConfig | null {
  if (
    !["test", "live"].includes(env.EMAIL_MODE ?? "") ||
    !env.RESEND_API_KEY ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.CRON_SECRET ||
    !env.RESEND_WEBHOOK_SECRET
  )
    return null;
  const email = z.email().safeParse(env.EMAIL_FROM);
  if (!email.success) return null;
  if (env.EMAIL_MODE === "live" && email.data.endsWith("@resend.dev"))
    return null;
  const allowlist = (env.EMAIL_TEST_RECIPIENTS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => z.email().safeParse(x).success);
  if (env.EMAIL_MODE === "test" && !allowlist.length) return null;
  const reply = env.EMAIL_REPLY_TO
    ? z.email().safeParse(env.EMAIL_REPLY_TO)
    : null;
  if (reply && !reply.success) return null;
  return {
    mode: env.EMAIL_MODE as EmailMode,
    apiKey: env.RESEND_API_KEY,
    sender: {
      name: (env.EMAIL_FROM_NAME || "Finoredesk")
        .replace(/[\r\n<>"\\]/g, " ")
        .slice(0, 100),
      email: email.data,
    },
    replyTo: reply?.success ? { email: reply.data } : undefined,
    allowlist,
  };
}
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (x) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        x
      ]!,
  );
}
export interface ResendPayload {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; content: string }[];
  tags: { name: string; value: string }[];
}
export function prepareEmail(
  invoice: Invoice,
  kind: "invoice" | "reminder",
  id: string,
  pdfBase64: string,
  config: EmailConfig,
): ResendPayload {
  const recipient = z
    .email()
    .parse(invoice.contact_snapshot?.email)
    .toLowerCase();
  if (config.mode === "test" && !config.allowlist.includes(recipient))
    throw new Error(
      "Test mode only sends to the configured recipient allowlist.",
    );
  const business =
      invoice.organization_snapshot?.name ?? "Your service provider",
    number = invoice.number ?? "Invoice";
  const subject =
    `${kind === "reminder" ? "Reminder: " : ""}${number} from ${business}`
      .replace(/[\r\n]/g, " ")
      .slice(0, 200);
  const due = invoice.due_date.split("-").reverse().join("/");
  const intro =
    kind === "reminder"
      ? `A reminder about ${number}. The recorded amount outstanding is ${money(invoice.outstanding_cents)}.`
      : `Please find ${number} attached. The invoice total is ${money(invoice.total_cents)}.`;
  const paragraphs = [
    `Hello ${invoice.contact_snapshot?.name ?? "there"},`,
    intro,
    `Due date: ${due}. Currency: AUD.`,
    invoice.notes || "",
    `Payment status reflects records entered by ${business}. If you have already paid, please reply so the records can be reviewed.`,
  ].filter(Boolean);
  return {
    from: `${config.sender.name} <${config.sender.email}>`,
    to: [recipient],
    reply_to: config.replyTo?.email,
    subject,
    text: paragraphs.join("\n\n"),
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#173e35;background:#f6f7f2;padding:28px"><div style="max-width:580px;background:white;padding:32px;border-radius:16px"><h1 style="font-size:24px">${escapeHtml(number)}</h1>${paragraphs.map((p) => `<p style="line-height:1.65;white-space:pre-wrap">${escapeHtml(p)}</p>`).join("")}<p style="font-size:12px;color:#73817a">Prepared with Finoredesk</p></div></body></html>`,
    attachments: [
      {
        filename: `${number.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`,
        content: pdfBase64,
      },
    ],
    tags: [
      { name: "application", value: "finoredesk" },
      { name: "delivery_id", value: id },
    ],
  };
}
export class DeliveryError extends Error {
  constructor(
    message: string,
    public outcome: "retry" | "failed" | "needs_review",
  ) {
    super(message);
  }
}
export async function submitResend(
  payload: ResendPayload,
  apiKey: string,
  deliveryId: string,
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": `finoredesk/${deliveryId}`,
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new DeliveryError(
      "Provider acceptance is unknown. Review delivery before resending.",
      "needs_review",
    );
  }
  if (response.status === 429)
    throw new DeliveryError(
      "Provider rate limit. Retry will be delayed.",
      "retry",
    );
  if (
    response.status >= 500 ||
    response.status === 409 ||
    response.status === 408
  )
    throw new DeliveryError(
      "Provider acceptance is unknown after a server error.",
      "needs_review",
    );
  if (!response.ok)
    throw new DeliveryError(
      "The email provider rejected this request. Review sender and recipient settings.",
      "failed",
    );
  const data = await response.json().catch(() => null);
  if (!z.uuid().safeParse(data?.id).success)
    throw new DeliveryError(
      "Provider response was incomplete. Review delivery before resending.",
      "needs_review",
    );
  return data.id as string;
}
