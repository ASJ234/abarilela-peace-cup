"use client";

import { useActionState, useRef, useState } from "react";
import { saveResultAction } from "@/app/actions";
import { FormMessage, HiddenFields, SubmitButton } from "@/components/forms";
import { ConfirmDialog, inputClass } from "@/components/ui";
import type { Match } from "@/lib/types";

/** Enter or correct a score. Emptying both boxes clears the result (after confirmation). */
export function ResultForm({ match }: { match: Match }) {
  const [state, action] = useActionState(saveResultAction, undefined);
  const [askClear, setAskClear] = useState(false);
  const confirmed = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

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
          <ScoreInput id={`h-${match.id}`} name="homeScore" value={match.homeScore} label={`${match.home.name} goals`} />
          <span className="text-muted">–</span>
          <ScoreInput id={`a-${match.id}`} name="awayScore" value={match.awayScore} label={`${match.away.name} goals`} />
        </div>
        <label htmlFor={`a-${match.id}`} className="line-clamp-2 break-words text-sm font-medium leading-tight sm:text-base">{match.away.name}</label>
      </div>
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

function ScoreInput({ id, name, value, label }: { id: string; name: string; value: number | null; label: string }) {
  return (
    <input
      key={value ?? "empty"}
      id={id}
      name={name}
      type="number"
      inputMode="numeric"
      min={0}
      max={99}
      defaultValue={value ?? ""}
      aria-label={label}
      className={`${inputClass} num !w-14 px-1 text-center !text-lg font-bold`}
    />
  );
}
