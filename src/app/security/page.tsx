import { userContext } from "@/lib/server/context";
import { SecuritySetup } from "@/components/security";
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string; challenge?: string }>;
}) {
  await userContext();
  const p = await searchParams;
  return (
    <SecuritySetup
      required={p.required === "1"}
      challenge={p.challenge === "1"}
    />
  );
}
