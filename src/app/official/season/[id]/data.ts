import { notFound, redirect } from "next/navigation";
import { isOfficial } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getSeason } from "@/lib/league";

/** Officials only: send everyone else to the sign-in page. */
export async function loadSeasonForOfficial(params: Promise<{ id: string }>) {
  if (!(await isOfficial())) redirect("/official");
  const { id } = await params;
  const season = getSeason(getDb(), Number(id));
  if (!season) notFound();
  return season;
}
