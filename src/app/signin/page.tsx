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
    <AuthShell title="Welcome back" subtitle="Sign in to follow your team, or to manage the league if you're an official.">
      <SignInForm next={next} />
    </AuthShell>
  );
}
