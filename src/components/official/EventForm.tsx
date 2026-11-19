"use client";

import { useState } from "react";
import { addEventAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Checkbox, Field, Input, Select } from "@/components/ui";
import type { EventType, Player } from "@/lib/types";

type Side = { id: number; name: string; coach: string | null; players: Player[] };

/** Same value as COACH in lib/matches (that module is server-only). */
const COACH = "coach";

const TYPES: { value: EventType; label: string }[] = [
  { value: "goal", label: "⚽ Goal" },
  { value: "own_goal", label: "⚽ Own goal" },
  { value: "yellow", label: "🟨 Yellow card" },
  { value: "red", label: "🟥 Red card" },
];

const playerLabel = (p: Player) => (p.number != null ? `${p.number}. ${p.name}` : p.name);

/** Record a goal (penalty, or with an optional assist), own goal, or card (for a player or the coach). */
export function EventForm({ matchId, home, away }: { matchId: number; home: Side; away: Side }) {
  const [type, setType] = useState<EventType>("goal");
  const [teamId, setTeamId] = useState(home.id);
  const [scorer, setScorer] = useState("");
  const [penalty, setPenalty] = useState(false);

  const team = teamId === home.id ? home : away;
  const opponent = teamId === home.id ? away : home;
  // For an own goal the player comes from the team that conceded.
  const pickFrom = type === "own_goal" ? opponent : team;
  const isGoal = type === "goal" || type === "own_goal";
  const isCard = !isGoal;
  const forCoach = isCard && scorer === COACH;

  return (
    <ActionForm action={addEventAction} fields={{ matchId }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="What happened">
          <Select name="type" value={type} onChange={(e) => { setType(e.target.value as EventType); setScorer(""); setPenalty(false); }}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label={isGoal ? "Goal for" : "Team"}>
          <Select name="teamId" value={teamId} onChange={(e) => { setTeamId(Number(e.target.value)); setScorer(""); }}>
            <option value={home.id}>{home.name}</option>
            <option value={away.id}>{away.name}</option>
          </Select>
        </Field>
      </div>

      {pickFrom.players.length === 0 && !isCard ? (
        <Alert tone="error">{pickFrom.name} has no players registered. Add the squad first.</Alert>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
          <Field label={type === "goal" ? "Scorer" : type === "own_goal" ? `Player (${pickFrom.name})` : "Player or coach"}>
            <Select name="playerId" required value={scorer} onChange={(e) => setScorer(e.target.value)}>
              <option value="" disabled>{isCard ? "Choose player or coach…" : "Choose player…"}</option>
              {isCard && <option value={COACH}>🧑‍💼 Coach{team.coach ? `: ${team.coach}` : ""}</option>}
              {pickFrom.players.map((p) => <option key={p.id} value={p.id}>{playerLabel(p)}</option>)}
            </Select>
          </Field>
          <Field label="Minute" className="sm:order-last">
            {/* Text, not number, so added time can be typed as "90+3". The phone keypad ("tel") has a + key. */}
            <Input
              name="minute"
              type="text"
              inputMode="tel"
              autoComplete="off"
              pattern="\s*\d{1,3}\s*(\+\s*\d{1,2})?\s*'?\s*"
              title="A minute like 37, or 45+2 / 90+3 for added time"
              placeholder="eg 90+3"
              className="num"
            />
          </Field>
          {forCoach && (
            <Field label="Coach's name" className="col-span-2 sm:col-span-1">
              {/* key: refill with the right team's coach when the team changes */}
              <Input key={teamId} name="coachName" required maxLength={60} defaultValue={team.coach ?? ""} placeholder="Coach's name" />
            </Field>
          )}
          {type === "goal" && !penalty && (
            <Field label="Assist (optional)" className="col-span-2 sm:col-span-1">
              <Select key={`${teamId}-${scorer}`} name="assistId" defaultValue="">
                <option value="">No assist</option>
                {team.players.filter((p) => String(p.id) !== scorer).map((p) => (
                  <option key={p.id} value={p.id}>{playerLabel(p)}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}

      {type === "goal" && (
        <Checkbox name="penalty" checked={penalty} onChange={(e) => setPenalty(e.target.checked)} label="Penalty (scored from the spot, no assist)" />
      )}
      {isCard && pickFrom.players.length === 0 && (
        <p className="text-xs text-muted">{pickFrom.name} has no players registered yet, so only the coach can be chosen.</p>
      )}

      <SubmitButton pendingText="Adding…" variant="secondary" className="w-full sm:w-auto">Add to match</SubmitButton>
    </ActionForm>
  );
}
