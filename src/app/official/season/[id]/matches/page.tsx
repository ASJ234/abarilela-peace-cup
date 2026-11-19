import type { Metadata } from "next";
import Link from "next/link";
import { createMatchAction, deleteMatchAction } from "@/app/actions";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms";
import { MatchDayList, MatchMeta } from "@/components/league";
import { EditMatchButton, MatchEditProvider, MatchFields, ResultForm } from "@/components/official";
import { Collapsible, EmptyState, LinkButton } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listGroups, listTeams } from "@/lib/league";
import { listMatches } from "@/lib/matches";
import { loadSeasonForOfficial } from "../data";

export const metadata: Metadata = { title: "Matches & results" };

export default async function MatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const season = await loadSeasonForOfficial(params);
  const db = getDb();
  const teams = await listTeams(db, season.id);
  const groups = await listGroups(db, season.id);
  const matches = await listMatches(db, season.id);
  const played = matches.filter((m) => m.played).length;

  return (
    <div className="space-y-6">
      <Collapsible title="Add a match" defaultOpen={matches.length === 0}>
        {teams.length < 2 ? (
          <p className="mt-3 text-sm text-muted">Add at least 2 teams first.</p>
        ) : (
          <ActionForm action={createMatchAction} fields={{ seasonId: season.id }} className="mt-4 space-y-3">
            <MatchFields teams={teams} groups={groups} format={season.format} />
            <SubmitButton className="w-full sm:w-auto">Add match</SubmitButton>
          </ActionForm>
        )}
      </Collapsible>

      {matches.length === 0 ? (
        <EmptyState icon="📅" title="No matches yet">
          Generate them on the{" "}
          <Link href={`/official/season/${season.id}/schedule`} className="font-medium text-brand underline">Schedule</Link>{" "}
          tab, or add them one by one above.
        </EmptyState>
      ) : (
        <MatchEditProvider teams={teams} groups={groups} format={season.format}>
          <p className="text-sm text-muted">
            {played} of {matches.length} matches played. Enter scores here. Use <strong>Edit</strong> to change the
            teams, date, kick-off, venue or stage, and <strong>Goals &amp; cards</strong> to record scorers, assists
            and cards.
          </p>
          <MatchDayList
            matches={matches}
            collapsePlayedDays
            renderMatch={(m) => (
              <div className="space-y-3 px-3 py-3 sm:px-4">
                <MatchMeta match={m} />
                <ResultForm match={m} />
                <div className="flex flex-wrap justify-center gap-2 border-t border-dashed border-border pt-3 sm:justify-end">
                  <EditMatchButton match={m} />
                  <LinkButton href={`/official/season/${season.id}/matches/${m.id}`} size="sm">⚽ Goals &amp; cards</LinkButton>
                  <DeleteButton
                    action={deleteMatchAction}
                    fields={{ matchId: m.id, stay: 1 }}
                    what={`${m.home.name} v ${m.away.name}`}
                    detail={m.played ? "The match and its result, goals and cards will be deleted." : undefined}
                  />
                </div>
              </div>
            )}
          />
        </MatchEditProvider>
      )}
    </div>
  );
}
