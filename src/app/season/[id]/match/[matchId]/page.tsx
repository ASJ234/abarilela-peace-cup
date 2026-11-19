import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventList, MatchMeta, Scoreline } from "@/components/league";
import { Card, LinkButton, Section } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { canManageSeason } from "@/lib/officials";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getMatch, listEvents } from "@/lib/matches";
import { loadSeason } from "../../data";

type Props = { params: Promise<{ id: string; matchId: string }> };

async function load(params: Props["params"]) {
  const season = await loadSeason(params);
  const match = await getMatch(getDb(), Number((await params).matchId));
  if (!match || match.seasonId !== season.id) notFound();
  return { season, match };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { match } = await load(params);
  return { title: `${match.home.name} v ${match.away.name}` };
}

export default async function MatchPage({ params }: Props) {
  const { season, match: m } = await load(params);
  const events = await listEvents(getDb(), m.id);

  return (
    <div className="space-y-4">
      <Card className="p-4 text-center sm:p-6">
        <p className="mb-2 text-sm text-muted">{formatDate(m.date)}</p>
        <Scoreline match={m} size="lg" />
        <div className="mt-3 flex justify-center">
          <MatchMeta match={m} showReferee />
        </div>
        {!m.played && <p className="mt-2 text-sm text-muted">Not played yet</p>}
      </Card>

      {(m.played || events.length > 0) && (
        <Section title="Match events">
          <EventList match={m} events={events} />
        </Section>
      )}

      {(await canManageSeason(getDb(), await getCurrentUser(), season.id)) && (
        <LinkButton href={`/official/season/${season.id}/matches/${m.id}`}>Edit this match (official)</LinkButton>
      )}
    </div>
  );
}
