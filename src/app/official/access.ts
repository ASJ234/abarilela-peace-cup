import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canManageSeason } from "@/lib/officials";
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

/** The admin, or an official the admin has added to this season. Anyone else goes back to the panel. */
export async function requireSeasonAccess(seasonId: number, returnTo: string) {
  const me = await requireOfficial(returnTo);
  if (!(await canManageSeason(getDb(), me, seasonId))) redirect("/official");
  return me;
}
