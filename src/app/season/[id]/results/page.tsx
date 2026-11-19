import type { Metadata } from "next";
import { MatchList } from "@/components/league";
import { getDb } from "@/lib/db";
import { listMatches } from "@/lib/matches";
import { loadSeason } from "../data";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${(await loadSeason(params)).name} results` };
}

export default async function ResultsPage({ params }: Props) {
  const season = await loadSeason(params);
  const played = (await listMatches(getDb(), season.id)).filter((m) => m.played);
  return (
    <MatchList
      matches={played}
      newestFirst
      hrefFor={(m) => `/season/${season.id}/match/${m.id}`}
      emptyText="No results yet."
    />
  );
}
