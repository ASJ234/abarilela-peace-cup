import type { Metadata } from "next";
import { StandingsTable, TableLegend } from "@/components/league";
import { getDb } from "@/lib/db";
import { getTables } from "@/lib/matches";
import { loadSeason } from "./data";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${(await loadSeason(params)).name} table` };
}

export default async function TablePage({ params }: Props) {
  const season = await loadSeason(params);
  const tables = await getTables(getDb(), season);
  const grouped = season.format === "groups";
  const teamHref = (teamId: number) => `/season/${season.id}/teams/${teamId}`;

  return (
    <div>
      <div className={grouped ? "grid gap-8 lg:grid-cols-2" : ""}>
        {tables.map((t) => (
          <StandingsTable key={t.group?.id ?? "league"} rows={t.rows} title={t.group?.name} teamHref={teamHref} />
        ))}
      </div>
      <TableLegend season={season} grouped={grouped} />
    </div>
  );
}
