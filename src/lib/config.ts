export function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (
    !url ||
    !key ||
    url.includes("your-project") ||
    key === "your-public-publishable-key"
  )
    return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    )
      return null;
    if (key.startsWith("sb_secret_")) return null;
    if (key.split(".").length === 3) {
      const payload = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.role !== "anon") return null;
    } else if (!key.startsWith("sb_publishable_")) return null;
    return { url, key };
  } catch {
    return null;
  }
}

export function safeNext(
  value: string | null | undefined,
  fallback = "/workspace",
) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return fallback;
  return /^\/(workspace(?:\/|$)|onboarding(?:\?|$)|security(?:\?|$)|auth\/password(?:\?|$))/.test(
    value,
  )
    ? value
    : fallback;
}
