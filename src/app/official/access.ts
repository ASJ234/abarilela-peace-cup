import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canManageLeague } from "@/lib/users";

/**
 * For official pages: sends signed-out visitors to sign in (and back here
 * afterwards) and fans to the "no access" page. Returns the official.
 */
export async function requireOfficial(returnTo: string) {
  const me = await getCurrentUser();
  if (!me) redirect(`/signin?next=${encodeURIComponent(returnTo)}`);
  if (!canManageLeague(me)) redirect("/official");
  return me;
}

export async function requireAdmin(returnTo: string) {
  const me = await requireOfficial(returnTo);
  if (me.role !== "admin") redirect("/official");
  return me;
}
