import { userContext } from "@/lib/server/context";
import { BusinessOnboarding } from "@/components/onboarding";
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  await userContext();
  return <BusinessOnboarding invite={(await searchParams).invite} />;
}
