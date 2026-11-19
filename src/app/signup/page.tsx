import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, SignUpForm } from "@/components/auth";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { safeNextPath } from "@/lib/format";
import { listTeamChoices } from "@/lib/league";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell title="Join the Peace Cup" subtitle="Free for every fan. Pick your team and never miss a match.">
      <SignUpForm next={next} teams={await listTeamChoices(getDb())} />
    </AuthShell>
  );
}
