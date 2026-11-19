import type { Metadata } from "next";
import { DateEditor, FixtureGenerator, KnockoutPlanner } from "@/components/official";
import { Section } from "@/components/ui";
import { getDb } from "@/lib/db";
import { roundsNeeded } from "@/lib/fixtures";
import { planKnockout } from "@/lib/knockout";
import { listDates, listGroups, listTeams } from "@/lib/league";
import { leagueFixtureCount, leagueResultCount } from "@/lib/matches";
import { loadSeasonForOfficial } from "../data";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const season = await loadSeasonForOfficial(params);
  const db = getDb();
  const teams = await listTeams(db, season.id);
  const groups = await listGroups(db, season.id);
  const dates = await listDates(db, season.id);

  const isGroups = season.format === "groups";
  const groupSizes = isGroups ? groups.map((g) => teams.filter((t) => t.groupId === g.id).length) : [teams.length];
  const unassigned = isGroups ? teams.filter((t) => t.groupId == null) : [];
  const small = isGroups ? groups.find((_, i) => groupSizes[i] < 2) : undefined;
  const problem =
    teams.length < 2 ? "Add at least 2 teams first (Teams & groups tab)."
    : isGroups && groups.length < 2 ? "Group stage needs at least 2 groups. Create them on the Teams & groups tab."
    : unassigned.length ? `Put every team in a group first. Not in a group: ${unassigned.map((t) => t.name).join(", ")}.`
    : small ? `${small.name} needs at least 2 teams.`
    : null;

  return (
    <div className="space-y-6">
      <Section
        title="1. Playing dates"
        description="The days matches can be played. Any number of matches can be played on one day; you control that in step 2."
      >
        <DateEditor seasonId={season.id} initialDates={dates} needed={Math.max(0, ...groupSizes.map((n) => roundsNeeded(n, !isGroups)))} />
      </Section>

      <Section
        title="2. Generate fixtures"
        description={`${
          isGroups
            ? "Matchday 1 of all groups is scheduled first, then matchday 2, and so on."
            : "Every team plays every other team at home and away."
        } You can edit any match afterwards on the Matches & results tab.`}
      >
        <FixtureGenerator
          seasonId={season.id}
          format={season.format}
          groupSizes={groupSizes}
          dateCount={dates.length}
          leagueFixtures={await leagueFixtureCount(db, season.id)}
          leagueResults={await leagueResultCount(db, season.id)}
          problem={problem}
        />
      </Section>

      <Section
        title="3. Knockout stage"
        description={`Once every ${isGroups ? "group" : "league"} match has a result, draw the knockout rounds from the final ${
          isGroups ? "group tables" : "table"
        }. Then create each next round from the winners. Level knockout matches are decided by the penalty shoot-out you enter with the score.`}
      >
        <KnockoutPlanner seasonId={season.id} plan={await planKnockout(db, season)} />
      </Section>
    </div>
  );
}
