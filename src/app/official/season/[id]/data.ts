import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getSeason } from "@/lib/league";
import { requireSeasonAccess } from "../../access";

/** The admin, or an official on this season: everyone else is sent to sign in or back to the panel. */
export async function loadSeasonForOfficial(params: Promise<{ id: string }>) {
  const { id } = await params;
  await requireSeasonAccess(Number(id), `/official/season/${id}`);
  const season = await getSeason(getDb(), Number(id));
  if (!season) notFound();
  return season;
}
