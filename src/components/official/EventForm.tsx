"use client";

import { useState } from "react";
import { addEventAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Field, Input, Select } from "@/components/ui";
import type { EventType, Player } from "@/lib/types";

type Side = { id: number; name: string; players: Player[] };

const TYPES: { value: EventType; label: string }[] = [
  { value: "goal", label: "⚽ Goal" },
  { value: "own_goal", label: "⚽ Own goal" },
  { value: "yellow", label: "🟨 Yellow card" },
  { value: "red", label: "🟥 Red card" },
];

const playerLabel = (p: Player) => (p.number != null ? `${p.number}. ${p.name}` : p.name);

/** Record a goal (with optional assist), own goal, or card. */
export function EventForm({ matchId, home, away }: { matchId: number; home: Side; away: Side }) {
  const [type, setType] = useState<EventType>("goal");
  const [teamId, setTeamId] = useState(home.id);
  const [scorer, setScorer] = useState("");

  const team = teamId === home.id ? home : away;
  const opponent = teamId === home.id ? away : home;
  // For an own goal the player comes from the team that conceded.
  const pickFrom = type === "own_goal" ? opponent : team;
  const isGoal = type === "goal" || type === "own_goal";

  return (
    <ActionForm action={addEventAction} fields={{ matchId }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="What happened">
          <Select name="type" value={type} onChange={(e) => { setType(e.target.value as EventType); setScorer(""); }}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label={isGoal ? "Goal for" : "Player's team"}>
          <Select name="teamId" value={teamId} onChange={(e) => { setTeamId(Number(e.target.value)); setScorer(""); }}>
            <option value={home.id}>{home.name}</option>
            <option value={away.id}>{away.name}</option>
          </Select>
        </Field>
      </div>

      {pickFrom.players.length === 0 ? (
        <Alert tone="error">{pickFrom.name} has no players registered. Add the squad first.</Alert>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem]">
          <Field label={type === "goal" ? "Scorer" : type === "own_goal" ? `Player (${pickFrom.name})` : "Player"}>
            <Select name="playerId" required value={scorer} onChange={(e) => setScorer(e.target.value)}>
              <option value="" disabled>Choose player…</option>
              {pickFrom.players.map((p) => <option key={p.id} value={p.id}>{playerLabel(p)}</option>)}
            </Select>
          </Field>
          <Field label="Minute" className="sm:order-last">
            <Input name="minute" type="number" inputMode="numeric" min={0} max={150} placeholder="–" className="num" />
          </Field>
          {type === "goal" && (
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

      <SubmitButton pendingText="Adding…" variant="secondary" className="w-full sm:w-auto">Add to match</SubmitButton>
    </ActionForm>
  );
}
