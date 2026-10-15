import { AuthForm } from "@/components/auth-form";
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  return <AuthForm mode={p.mode} next={p.next} initialError={p.error} />;
}
