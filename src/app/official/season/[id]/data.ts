import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getSeason } from "@/lib/league";
import { requireOfficial } from "../../access";

/** Officials only: everyone else is sent to sign in or told they lack access. */
export async function loadSeasonForOfficial(params: Promise<{ id: string }>) {
  const { id } = await params;
  await requireOfficial(`/official/season/${id}`);
  const season = getSeason(getDb(), Number(id));
  if (!season) notFound();
  return season;
}
