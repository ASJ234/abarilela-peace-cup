import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddPlayersForm, SquadEditor } from "@/components/official";
import { PageHeader, Section } from "@/components/ui";
import { getDb } from "@/lib/db";
import { getTeam } from "@/lib/league";
import { squadWithStats } from "@/lib/players";
import { loadSeasonForOfficial } from "../../data";

export const metadata: Metadata = { title: "Squad" };

export default async function SquadPage({ params }: { params: Promise<{ id: string; teamId: string }> }) {
  const season = await loadSeasonForOfficial(params);
  const db = getDb();
  const team = await getTeam(db, Number((await params).teamId));
  if (!team || team.seasonId !== season.id) notFound();
  const squad = await squadWithStats(db, team.id);

  return (
    <div className="space-y-6">
      <PageHeader
        level={2}
        title={`${team.name} squad`}
        subtitle={`${squad.length} player${squad.length === 1 ? "" : "s"} registered`}
        back={{ href: `/official/season/${season.id}`, label: "All teams" }}
      />
      <Section>
        <AddPlayersForm teamId={team.id} />
      </Section>
      {squad.length > 0 && <SquadEditor squad={squad} />}
    </div>
  );
}
