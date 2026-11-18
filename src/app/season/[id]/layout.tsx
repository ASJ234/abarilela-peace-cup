import { SeasonNav, SeasonSwitcher } from "@/components/league";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db";
import { seasonNumbers } from "@/lib/insights";
import { listSeasons } from "@/lib/league";
import { FORMAT_LABEL } from "@/lib/types";
import { loadSeason } from "./data";

export default async function SeasonLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const season = await loadSeason(params);
  const db = getDb();
  const seasons = listSeasons(db).map((s) => {
    const n = seasonNumbers(db, s.id);
    return { id: s.id, name: s.name, format: s.format, teams: n.teams, played: n.played, matches: n.matches };
  });

  return (
    <>
      <PageHeader
        title={season.name}
        subtitle={season.format === "groups" ? `${FORMAT_LABEL.groups} · each pair meets once` : `${FORMAT_LABEL.league} · home and away`}
        actions={<SeasonSwitcher seasons={seasons} currentId={season.id} />}
      />
      <SeasonNav currentId={season.id} />
      {children}
    </>
  );
}
