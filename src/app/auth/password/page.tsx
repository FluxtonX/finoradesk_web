import { AuthForm } from "@/components/auth-form";
import { redirect } from "next/navigation";
import { userContext } from "@/lib/server/context";

export default async function PasswordPage() {
  const { db } = await userContext();
  const { data, error } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data)
    throw new Error("Could not verify account security. Please try again.");
  if (data.nextLevel === "aal2" && data.currentLevel !== "aal2")
    redirect("/security?challenge=1&next=/auth/password");
  return <AuthForm mode="password" />;
}
