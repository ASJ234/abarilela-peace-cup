import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteEventAction, deleteMatchAction, updateMatchAction } from "@/app/actions";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms";
import { EventList, EVENT_LABEL, MatchMeta } from "@/components/league";
import { EventForm, MatchFields, ResultForm } from "@/components/official";
import { Alert, PageHeader, Section } from "@/components/ui";
import { getDb } from "@/lib/db";
import { formatDate, formatMinute } from "@/lib/format";
import { listGroups, listTeams } from "@/lib/league";
import { getMatch, goalsRecorded, listEvents } from "@/lib/matches";
import { listPlayers } from "@/lib/players";
import { loadSeasonForOfficial } from "../../data";

export const metadata: Metadata = { title: "Match details" };

export default async function MatchEditor({ params }: { params: Promise<{ id: string; matchId: string }> }) {
  const season = await loadSeasonForOfficial(params);
  const db = getDb();
  const m = getMatch(db, Number((await params).matchId));
  if (!m || m.seasonId !== season.id) notFound();

  const events = listEvents(db, m.id);
  const recorded = goalsRecorded(events, m);
  const mismatch = m.played && (recorded.home !== m.homeScore || recorded.away !== m.awayScore);
  const squadHref = (teamId: number) => `/official/season/${season.id}/teams/${teamId}`;

  return (
    <div className="space-y-6">
      <PageHeader
        level={2}
        title={`${m.home.name} v ${m.away.name}`}
        back={{ href: `/official/season/${season.id}/matches`, label: "All matches" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {formatDate(m.date)} <MatchMeta match={m} />
          </span>
        }
      />

      <Section title="Score">
        <ResultForm match={m} />
      </Section>

      <Section title="Goals, assists & cards">
        {mismatch && (
          <Alert tone="error" className="mb-3">
            Goals recorded ({recorded.home}–{recorded.away}) don&apos;t match the score ({m.homeScore}–{m.awayScore}) yet.
          </Alert>
        )}
        <div className="mb-4">
          <EventList
            match={m}
            events={events}
            renderAction={(e) => (
              <DeleteButton
                action={deleteEventAction}
                fields={{ eventId: e.id }}
                what={`this ${EVENT_LABEL[e.type].toLowerCase()}`}
                verb="Remove"
                label="✕"
                detail={`${EVENT_LABEL[e.type]} by ${e.player.name}${e.minute != null ? ` (${formatMinute(e)})` : ""} will be removed from the match and the stats.`}
              />
            )}
          />
        </div>
        <div className="border-t border-border pt-4">
          <EventForm
            matchId={m.id}
            home={{ ...m.home, players: listPlayers(db, m.home.id) }}
            away={{ ...m.away, players: listPlayers(db, m.away.id) }}
          />
          <p className="mt-3 text-xs text-muted">
            Missing a player? Edit the <Link href={squadHref(m.home.id)} className="underline">{m.home.name}</Link> or{" "}
            <Link href={squadHref(m.away.id)} className="underline">{m.away.name}</Link> squad.
          </p>
        </div>
      </Section>

      <Section title="Edit match" description="Change the teams, date, kick-off time, venue or stage.">
        <ActionForm action={updateMatchAction} fields={{ matchId: m.id }} className="space-y-3">
          <MatchFields teams={listTeams(db, season.id)} groups={listGroups(db, season.id)} format={season.format} match={m} />
          <SubmitButton className="w-full sm:w-auto">Save details</SubmitButton>
        </ActionForm>
      </Section>

      <Section tone="danger" title="Delete match" description="Removes the match with its score, goals and cards.">
        <DeleteButton
          action={deleteMatchAction}
          fields={{ matchId: m.id }}
          what={`${m.home.name} v ${m.away.name}`}
          detail="The match, its score, goals and cards will be permanently deleted."
          label="Delete match"
          size="md"
        />
      </Section>
    </div>
  );
}
