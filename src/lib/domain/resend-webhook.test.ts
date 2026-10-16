import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifyResendEvent } from "./resend-webhook";
const bytes = Buffer.from("test-only-webhook-signing-key-1234");
const secret = `whsec_${bytes.toString("base64")}`;
const email = "10000000-0000-4000-8000-000000000001";
const delivery = "10000000-0000-4000-8000-000000000002";
function signed(
  type = "email.delivered",
  tags = { application: "finoredesk", delivery_id: delivery },
  age = 0,
) {
  const raw = JSON.stringify({
    type,
    created_at: new Date().toISOString(),
    data: { email_id: email, to: ["Recipient@example.test"], tags },
  });
  const timestamp = String(Math.floor(Date.now() / 1000) - age);
  const id = "msg_test_only";
  const signature = createHmac("sha256", bytes)
    .update(`${id}.${timestamp}.${raw}`)
    .digest("base64");
  return {
    raw,
    headers: {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
  };
}
describe("Resend signed events", () => {
  it("verifies raw bytes and maps provider email ID and delivery tag", () => {
    const { raw, headers } = signed();
    expect(verifyResendEvent(raw, headers, secret)).toMatchObject({
      provider_message: email,
      delivery_hint: delivery,
      event_name: "delivered",
      event_key_value: "resend:msg_test_only",
      recipient_email: "recipient@example.test",
    });
  });
  it("rejects forged signatures, changed payloads, missing headers and old requests", () => {
    const { raw, headers } = signed();
    expect(() =>
      verifyResendEvent(
        raw,
        { ...headers, "svix-signature": "v1,forged" },
        secret,
      ),
    ).toThrow();
    expect(() => verifyResendEvent(raw + " ", headers, secret)).toThrow();
    expect(() => verifyResendEvent(raw, {}, secret)).toThrow();
    const old = signed("email.delivered", undefined, 600);
    expect(() => verifyResendEvent(old.raw, old.headers, secret)).toThrow();
  });
  it("ignores unrelated account emails and unneeded tracking events", () => {
    for (const item of [
      signed("email.delivered", {
        application: "another-app",
        delivery_id: delivery,
      }),
      signed("email.opened"),
    ])
      expect(verifyResendEvent(item.raw, item.headers, secret)).toBeNull();
  });
  it.each([
    ["email.bounced", "hard_bounce"],
    ["email.complained", "spam"],
    ["email.suppressed", "blocked"],
    ["email.failed", "failed"],
    ["email.sent", "sent"],
    ["email.delivery_delayed", "delayed"],
  ])("maps %s without treating it as delivered", (type, name) => {
    const { raw, headers } = signed(type);
    expect(verifyResendEvent(raw, headers, secret)?.event_name).toBe(name);
  });
});
