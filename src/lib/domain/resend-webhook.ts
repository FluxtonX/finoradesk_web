import { Webhook } from "svix";
import { z } from "zod";

const eventSchema = z.object({
  type: z.string().max(80),
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({
    email_id: z.uuid(),
    to: z.array(z.email()).min(1).max(50),
    tags: z.record(z.string(), z.string()).optional(),
  }),
});

// Provider-native names map onto the application's existing terminal states.
const eventNames: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "hard_bounce",
  "email.complained": "spam",
  "email.suppressed": "blocked",
  "email.failed": "failed",
};

export function verifyResendEvent(
  raw: string,
  headers: Record<string, string>,
  secret: string,
) {
  new Webhook(secret).verify(raw, headers);
  const event = eventSchema.parse(JSON.parse(raw));
  const tags = event.data.tags;
  if (tags?.application !== "finoredesk" || !eventNames[event.type])
    return null;
  const hint = z.uuid().parse(tags.delivery_id);
  // Finoredesk sends exactly one recipient per request.
  if (event.data.to.length !== 1) throw new Error("Unexpected recipients.");
  return {
    provider_message: event.data.email_id,
    delivery_hint: hint,
    event_key_value: `resend:${headers["svix-id"]}`,
    event_name: eventNames[event.type],
    event_time: event.created_at,
    recipient_email: event.data.to[0].toLowerCase(),
  };
}
