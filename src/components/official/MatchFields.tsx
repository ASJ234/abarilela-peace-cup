import { useId } from "react";
import { Field, Input, Select } from "@/components/ui";
import type { Format, Group, Match, Team } from "@/lib/types";

const STAGES = ["Round of 16", "Quarter-final", "Semi-final", "Third place", "Final", "Friendly"];

/** Inputs for creating/editing a match. Use inside an <ActionForm>. Works on server and client. */
export function MatchFields({
  teams,
  groups,
  format,
  match,
}: {
  teams: Team[];
  groups: Group[];
  format: Format;
  match?: Match;
}) {
  const stageListId = useId();
  const phase = format === "groups" ? "group" : "league";
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const teamLabel = (t: Team) =>
    format === "groups" && t.groupId != null ? `${t.name} (${groupName.get(t.groupId)})` : t.name;
  const teamSelect = (name: string, label: string, value?: number) => (
    <Field label={label}>
      {/* key: remount after save so the form reset shows the saved team (see SquadEditor) */}
      <Select key={value ?? ""} name={name} required defaultValue={value ?? ""}>
        <option value="" disabled>Choose team…</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{teamLabel(t)}</option>)}
      </Select>
    </Field>
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {teamSelect("homeTeamId", "Home team", match?.home.id)}
        {teamSelect("awayTeamId", "Away team", match?.away.id)}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Date">
          <Input name="date" type="date" defaultValue={match?.date ?? ""} />
        </Field>
        <Field label="Kick-off">
          <Input name="kickoff" type="time" defaultValue={match?.kickoff ?? ""} />
        </Field>
        <Field label="Venue" className="col-span-2">
          <Input name="venue" maxLength={80} defaultValue={match?.venue ?? ""} placeholder="Optional" />
        </Field>
      </div>
      <Field label="Referee">
        <Input name="referee" maxLength={60} defaultValue={match?.referee ?? ""} placeholder="Optional" autoComplete="off" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Stage">
          <Input
            name="stage"
            maxLength={40}
            defaultValue={match?.stage ?? ""}
            placeholder="e.g. Final"
            list={stageListId}
          />
          <datalist id={stageListId}>
            {STAGES.map((s) => <option key={s} value={s} />)}
          </datalist>
        </Field>
        <Field label="Matchday">
          <Input name="round" type="number" inputMode="numeric" min={0} max={500} defaultValue={match?.round || ""} placeholder="Optional" className="num" />
        </Field>
      </div>
      <p className="text-xs text-muted">
        Leave <strong>Stage</strong> blank for a {phase} match that counts toward the table.
        Enter a stage such as &ldquo;Semi-final&rdquo; for knockout or other matches that shouldn&apos;t count.
      </p>
    </div>
  );
}
