import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getSeason } from "@/lib/league";

/** Load a season from the route param or render the 404 page. */
export async function loadSeason(params: Promise<{ id: string }>) {
  const { id } = await params;
  const season = await getSeason(getDb(), Number(id));
  if (!season) notFound();
  return season;
}
