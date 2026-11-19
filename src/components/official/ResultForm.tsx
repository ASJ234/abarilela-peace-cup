"use client";

import { useActionState, useRef, useState } from "react";
import { saveResultAction } from "@/app/actions";
import { FormMessage, HiddenFields, SubmitButton } from "@/components/forms";
import { ConfirmDialog, inputClass } from "@/components/ui";
import type { Match } from "@/lib/types";

/**
 * Enter or correct a score. Emptying both boxes clears the result (after confirmation).
 * For a knockout match (one with a stage) that's level, the penalty shoot-out score
 * can be entered too.
 */
export function ResultForm({ match }: { match: Match }) {
  const [state, action] = useActionState(saveResultAction, undefined);
  const [askClear, setAskClear] = useState(false);
  const confirmed = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Track the typed score so the shoot-out boxes appear as soon as it's level.
  const [home, setHome] = useState(match.homeScore == null ? "" : String(match.homeScore));
  const [away, setAway] = useState(match.awayScore == null ? "" : String(match.awayScore));
  const level = match.stage != null && home !== "" && home === away;

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        const fd = new FormData(e.currentTarget);
        const clearing = match.played && !String(fd.get("homeScore")) && !String(fd.get("awayScore"));
        if (clearing && !confirmed.current) {
          e.preventDefault();
          setAskClear(true);
        }
        confirmed.current = false;
      }}
    >
      <HiddenFields fields={{ matchId: match.id }} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
        <label htmlFor={`h-${match.id}`} className="line-clamp-2 break-words text-right text-sm font-medium leading-tight sm:text-base">{match.home.name}</label>
        <div className="flex items-center gap-1">
          <ScoreInput id={`h-${match.id}`} name="homeScore" value={match.homeScore} label={`${match.home.name} goals`} onChange={setHome} />
          <span className="text-muted">–</span>
          <ScoreInput id={`a-${match.id}`} name="awayScore" value={match.awayScore} label={`${match.away.name} goals`} onChange={setAway} />
        </div>
        <label htmlFor={`a-${match.id}`} className="line-clamp-2 break-words text-sm font-medium leading-tight sm:text-base">{match.away.name}</label>
      </div>
      {level && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5 text-sm">
          <span className="font-medium">Penalties</span>
          <ScoreInput id={`hp-${match.id}`} name="homePens" value={match.homePens} label={`${match.home.name} penalties`} small />
          <span className="text-muted">–</span>
          <ScoreInput id={`ap-${match.id}`} name="awayPens" value={match.awayPens} label={`${match.away.name} penalties`} small />
          <span className="text-xs text-muted">if it went to a shoot-out</span>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <SubmitButton variant={match.played ? "secondary" : "primary"} size="sm">
          {match.played ? "Update score" : "Save score"}
        </SubmitButton>
        <FormMessage state={state} inline />
      </div>

      <ConfirmDialog
        open={askClear}
        title="Clear this result?"
        message={`${match.home.name} ${match.homeScore}–${match.awayScore} ${match.away.name} will be marked as not played, and the tables will update. Goals and cards stay recorded.`}
        confirmLabel="Clear result"
        onCancel={() => setAskClear(false)}
        onConfirm={() => {
          setAskClear(false);
          confirmed.current = true;
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}

function ScoreInput({
  id, name, value, label, onChange, small,
}: { id: string; name: string; value: number | null; label: string; onChange?: (v: string) => void; small?: boolean }) {
  return (
    <input
      key={value ?? "empty"}
      onChange={onChange && ((e) => onChange(e.target.value.trim()))}
      id={id}
      name={name}
      type="number"
      inputMode="numeric"
      min={0}
      max={99}
      defaultValue={value ?? ""}
      aria-label={label}
      className={`${inputClass} num px-1 text-center font-bold ${small ? "!h-9 !w-12" : "!w-14 !text-lg"}`}
    />
  );
}
