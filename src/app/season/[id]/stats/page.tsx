import type { Metadata } from "next";
import { StatTable, type StatRow } from "@/components/league";
import { getDb } from "@/lib/db";
import { coachCards, discipline, topAssists, topScorers } from "@/lib/players";
import type { PlayerStat } from "@/lib/types";
import { loadSeason } from "../data";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${(await loadSeason(params)).name} stats` };
}

export default async function StatsPage({ params }: Props) {
  const season = await loadSeason(params);
  const db = getDb();
  const teamHref = (teamId: number) => `/season/${season.id}/teams/${teamId}`;
  const toRows = (list: PlayerStat[]): StatRow[] =>
    list.map((s) => ({ key: s.playerId, name: s.name, teamName: s.teamName, teamHref: teamHref(s.teamId), values: [s.count] }));

  const cards = await discipline(db, season.id);
  const reds = cards.filter((c) => c.red > 0);
  const scorers = await topScorers(db, season.id);
  const coaches = await coachCards(db, season.id);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <StatTable
        title="⚽ Top scorers"
        columns={["Goals", "Pens"]}
        rows={scorers.map((s) => ({ key: s.playerId, name: s.name, teamName: s.teamName, teamHref: teamHref(s.teamId), values: [s.count, s.penalties] }))}
        emptyText="No goals recorded yet."
      />
      <StatTable title="🎯 Top assists" columns={["Assists"]} rows={toRows(await topAssists(db, season.id))} emptyText="No assists recorded yet." />
      <StatTable
        title="🟥 Red cards"
        columns={["Red"]}
        rows={reds.map((c) => ({ key: c.playerId, name: c.name, teamName: c.teamName, teamHref: teamHref(c.teamId), values: [c.red] }))}
        emptyText="No red cards. 🕊️"
      />
      <StatTable
        title="🟨 Discipline (all cards)"
        columns={["🟨", "🟥"]}
        rows={cards.map((c) => ({ key: c.playerId, name: c.name, teamName: c.teamName, teamHref: teamHref(c.teamId), values: [c.yellow, c.red] }))}
        emptyText="No cards shown yet."
      />
      {coaches.length > 0 && (
        <StatTable
          title="🧑‍💼 Coaches' cards"
          columns={["🟨", "🟥"]}
          rows={coaches.map((c) => ({ key: `${c.teamId}-${c.name}`, name: c.name, teamName: c.teamName, teamHref: teamHref(c.teamId), values: [c.yellow, c.red] }))}
          emptyText=""
        />
      )}
    </div>
  );
}
