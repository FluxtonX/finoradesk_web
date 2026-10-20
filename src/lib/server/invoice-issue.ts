import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function issueSavedInvoice(
  db: SupabaseClient,
  org: string,
  invoice: string,
) {
  const params = { org, target_invoice: invoice };
  const result = await db.rpc("issue_web_invoice", params);
  if (!result.error) return;
  // Older hosted installations have the core issuer but no optional review module.
  if (
    result.error.code !== "PGRST202" ||
    !result.error.message.includes("issue_web_invoice")
  )
    throw new Error(result.error.message);

  const policy = await db
    .from("web_business_preferences")
    .select("invoice_approval_required")
    .eq("organization_id", org)
    .maybeSingle();
  const missingPolicyTable =
    policy.error &&
    ["PGRST205", "42P01"].includes(policy.error.code) &&
    policy.error.message.includes("web_business_preferences");
  if (policy.error && !missingPolicyTable)
    throw new Error(policy.error.message);
  if (policy.data?.invoice_approval_required)
    throw new Error(
      "Invoice approval is enabled, but its issuing service needs an update. Your draft has been kept. Contact support.",
    );
  // The core RPC retains its atomic numbering, snapshots and any installed
  // database approval trigger, including a policy enabled during this request.
  const issued = await db.rpc("issue_invoice", params);
  if (issued.error) throw new Error(issued.error.message);
}
