"use client";

import { useState } from "react";
import { clearFixturesAction, generateFixturesAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Checkbox, Field, Input } from "@/components/ui";
import type { Format } from "@/lib/types";
import { roundsNeeded } from "@/lib/fixtures";
import { minDatesNeeded } from "@/lib/scheduler";

export function FixtureGenerator({
  seasonId,
  format,
  groupSizes,
  dateCount,
  leagueFixtures,
  leagueResults,
  problem,
}: {
  seasonId: number;
  /** League = home and away in one table; group stage = each pair in a group meets once. */
  format: Format;
  /** Team count per group (a single entry for the league format). */
  groupSizes: number[];
  dateCount: number;
  leagueFixtures: number;
  leagueResults: number;
  /** A setup issue that blocks generation (e.g. teams without a group). */
  problem: string | null;
}) {
  const doubleRound = format === "league";
  const [oncePerDay, setOncePerDay] = useState(true);
  const [maxPerDay, setMaxPerDay] = useState("");

  const legs = doubleRound ? 2 : 1;
  const total = groupSizes.reduce((sum, n) => sum + (n * (n - 1) * legs) / 2, 0);
  const matchdays = Math.max(0, ...groupSizes.map((n) => roundsNeeded(n, doubleRound)));
  const minDates = minDatesNeeded(total, matchdays, { maxPerDay: Number(maxPerDay) || null, oncePerDay });

  const formatNote = (
    <Alert tone="info">
      {format === "league" ? (
        <><strong>League format:</strong> all teams in one table. Every team plays every other team twice, once at home and once away.</>
      ) : (
        <><strong>Group stage:</strong> every team plays each team in its own group once (no return legs). Each group has its own table.</>
      )}{" "}
      <span className="text-muted">The format is chosen under Settings.</span>
    </Alert>
  );

  const clearForm = (withResults: boolean) => (
    <ActionForm action={clearFixturesAction} fields={{ seasonId }} className="space-y-2 border-t border-border pt-4">
      <SubmitButton
        variant="danger"
        pendingText="Clearing…"
        confirm={{
          title: withResults ? "Clear fixtures and results?" : "Clear fixtures?",
          message: withResults
            ? "All league/group fixtures will be deleted together with their results, goals and cards. The tables reset to zero. Stage matches (e.g. Final) are kept."
            : "All league/group fixtures will be deleted. Stage matches (e.g. Final) are kept.",
          confirmLabel: "Clear fixtures",
        }}
      >
        {withResults ? "Clear league/group fixtures and results" : "Clear league/group fixtures"}
      </SubmitButton>
    </ActionForm>
  );

  if (leagueResults > 0) {
    return (
      <div className="space-y-3">
        {formatNote}
        <p className="text-sm">
          <strong>{leagueFixtures}</strong> league/group fixtures exist and <strong>{leagueResults}</strong> have results.
          The schedule is locked now that results are coming in. You can still add, move or delete individual
          matches under <em>Matches &amp; results</em>.
        </p>
        {clearForm(true)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ActionForm action={generateFixturesAction} fields={{ seasonId }} className="space-y-4">
        {formatNote}
        <div className="grid gap-1">
          <Checkbox name="oncePerDay" checked={oncePerDay} onChange={(e) => setOncePerDay(e.target.checked)} label="A team plays at most one match per day" />
          <Checkbox name="shuffle" defaultChecked label="Random draw (shuffle teams before scheduling)" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Maximum matches per day" hint="Leave empty for no limit. With a limit, some teams rest on a day.">
            <Input
              name="maxPerDay"
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              value={maxPerDay}
              onChange={(e) => setMaxPerDay(e.target.value)}
              placeholder="No limit"
              className="num"
            />
          </Field>
          <Field label="Kick-off times in a day" hint="Optional. The 1st match of a day gets the 1st time, and so on.">
            <Input name="kickoffTimes" placeholder="10:00, 12:00, 14:00" />
          </Field>
        </div>

        <Alert tone={problem || dateCount < minDates ? "error" : "info"}>
          {problem ??
            `${total} matches${format === "groups" ? ` across ${groupSizes.length} groups` : ""}. ` +
              `With these options you need at least ${minDates} playing date${minDates === 1 ? "" : "s"}; you have ${dateCount}.`}
        </Alert>

        <SubmitButton
          pendingText="Generating…"
          className="w-full sm:w-auto"
          confirm={
            leagueFixtures > 0
              ? {
                  title: "Replace the fixtures?",
                  message: "All current league/group fixtures will be deleted and generated again. Stage matches (e.g. Final) are kept.",
                  confirmLabel: "Regenerate",
                }
              : undefined
          }
        >
          {leagueFixtures > 0 ? "Regenerate fixtures" : "Generate fixtures"}
        </SubmitButton>
      </ActionForm>

      {leagueFixtures > 0 && clearForm(false)}
    </div>
  );
}
