import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, SignInForm } from "@/components/auth";
import { getCurrentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/format";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell title="Officials sign in" subtitle="For the admin and match officials. Everyone else can view the whole site without an account.">
      <SignInForm next={next} />
    </AuthShell>
  );
}
