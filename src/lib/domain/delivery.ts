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
    !env.BREVO_API_KEY ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.CRON_SECRET ||
    !env.EMAIL_WEBHOOK_SECRET
  )
    return null;
  const email = z.email().safeParse(env.EMAIL_FROM);
  if (!email.success) return null;
  const allowlist = (env.EMAIL_TEST_RECIPIENTS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => z.email().safeParse(x).success);
  if (env.EMAIL_MODE === "test" && !allowlist.length) return null;
  const replyTo = env.EMAIL_REPLY_TO
    ? { email: z.email().parse(env.EMAIL_REPLY_TO) }
    : undefined;
  return {
    mode: env.EMAIL_MODE as EmailMode,
    apiKey: env.BREVO_API_KEY,
    sender: {
      name: env.EMAIL_FROM_NAME?.slice(0, 100) || "Finoredesk",
      email: email.data,
    },
    replyTo,
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
export interface BrevoPayload {
  sender: { name: string; email: string };
  to: { email: string; name?: string }[];
  replyTo?: { email: string };
  subject: string;
  textContent: string;
  htmlContent: string;
  attachment: { name: string; content: string }[];
  headers: Record<string, string>;
  tags: string[];
}
export function prepareEmail(
  invoice: Invoice,
  kind: "invoice" | "reminder",
  id: string,
  pdfBase64: string,
  config: EmailConfig,
): BrevoPayload {
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
    sender: config.sender,
    to: [
      { email: recipient, name: invoice.contact_snapshot?.name?.slice(0, 100) },
    ],
    replyTo: config.replyTo,
    subject,
    textContent: paragraphs.join("\n\n"),
    htmlContent: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#173e35;background:#f6f7f2;padding:28px"><div style="max-width:580px;background:white;padding:32px;border-radius:16px"><h1 style="font-size:24px">${escapeHtml(number)}</h1>${paragraphs.map((p) => `<p style="line-height:1.65;white-space:pre-wrap">${escapeHtml(p)}</p>`).join("")}<p style="font-size:12px;color:#73817a">Prepared with Finoredesk</p></div></body></html>`,
    attachment: [
      {
        name: `${number.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`,
        content: pdfBase64,
      },
    ],
    headers: { "Idempotency-Key": id, "X-Mailin-custom": `finoredesk:${id}` },
    tags: [`finoredesk:${id}`],
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
export async function submitBrevo(
  payload: BrevoPayload,
  apiKey: string,
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "api-key": apiKey,
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
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
  if (response.status >= 500)
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
  if (typeof data?.messageId !== "string")
    throw new DeliveryError(
      "Provider response was incomplete. Review delivery before resending.",
      "needs_review",
    );
  return data.messageId.replace(/^<|>$/g, "");
}
export function normaliseMessageId(value: string) {
  return value.trim().replace(/^<|>$/g, "");
}
