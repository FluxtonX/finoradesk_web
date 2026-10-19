import { userContext } from "@/lib/server/context";
import { SecuritySetup } from "@/components/security";
import { safeNext } from "@/lib/config";
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{
    required?: string;
    challenge?: string;
    next?: string;
  }>;
}) {
  await userContext();
  const p = await searchParams;
  return (
    <SecuritySetup
      required={p.required === "1"}
      challenge={p.challenge === "1"}
      next={safeNext(p.next)}
    />
  );
}
