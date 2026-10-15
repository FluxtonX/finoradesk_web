import { afterEach, describe, it, expect, vi } from "vitest";
import { publicConfig } from "./config";
afterEach(() => vi.unstubAllEnvs());
describe("public configuration boundary", () => {
  it("accepts a publishable key and rejects server secret keys", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_test_fixture",
    );
    expect(publicConfig()).not.toBeNull();
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_secret_rejected_fixture",
    );
    expect(publicConfig()).toBeNull();
  });
  it("accepts legacy anonymous credentials but rejects a service role", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    const jwt = (role: string) =>
      `fixture.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.fixture`;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", jwt("anon"));
    expect(publicConfig()).not.toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", jwt("service_role"));
    expect(publicConfig()).toBeNull();
  });
  it("requires HTTPS except on local development hosts", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://example.test");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_test_fixture",
    );
    expect(publicConfig()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54329");
    expect(publicConfig()).not.toBeNull();
  });
});
