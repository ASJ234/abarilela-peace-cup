"use client";

import { useState } from "react";
import { createFirstKnockoutRoundAction, createNextKnockoutRoundAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Checkbox, Field, Input } from "@/components/ui";
import type { KnockoutPlan, Pairing } from "@/lib/knockout";

/**
 * Knockout rounds on the Schedule tab: choose how many teams go through and draw the
 * first round from the final tables, then draw each next round from the winners.
 * Every draw is previewed before anything is created.
 */
export function KnockoutPlanner({ seasonId, plan }: { seasonId: number; plan: KnockoutPlan }) {
  if (plan.kind === "done") {
    return (
      <p className="text-sm text-muted">
        The final has been drawn: <strong className="text-fg">{plan.final.home.name} v {plan.final.away.name}</strong>. Enter its
        score on the Matches &amp; results tab.
      </p>
    );
  }
  return plan.kind === "first" ? <FirstRound seasonId={seasonId} plan={plan} /> : <NextRound seasonId={seasonId} plan={plan} />;
}

function FirstRound({ seasonId, plan }: { seasonId: number; plan: Extract<KnockoutPlan, { kind: "first" }> }) {
  // Default: top 2 per group (or top 4 from one table), the usual choice.
  const preferred = plan.options.find((o) => o.perGroup === (plan.groups === 1 ? 4 : 2)) ?? plan.options[0];
  const [perGroup, setPerGroup] = useState(preferred?.perGroup ?? 0);
  const chosen = plan.options.find((o) => o.perGroup === perGroup);

  if (plan.options.length === 0) return <Alert>{plan.blocked ?? "These tables can't make a knockout bracket."}</Alert>;

  const what = (k: number) =>
    plan.groups === 1 ? `Top ${k}` : k === 1 ? "Group winners" : `Top ${k} of each group`;

  return (
    <ActionForm action={createFirstKnockoutRoundAction} fields={{ seasonId, perGroup }} className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Who goes through?</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {plan.options.map((o) => (
            <label
              key={o.perGroup}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${
                o.perGroup === perGroup ? "border-brand bg-brand-soft" : "border-border hover:border-brand"
              }`}
            >
              <input
                type="radio"
                name="perGroupChoice"
                className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                checked={o.perGroup === perGroup}
                onChange={() => setPerGroup(o.perGroup)}
              />
              <span>
                <span className="block font-semibold">{what(o.perGroup)}</span>
                <span className="text-muted">
                  {o.pairings.length * 2} teams · starts with the {o.pairings.length === 1 ? "final" : `${o.stage.toLowerCase()}s`}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {chosen && (
        <Preview
          title={`${chosen.stage === "Final" ? "Final" : `${chosen.stage}s`} from the current tables`}
          pairings={chosen.pairings}
          note={
            plan.groups > 1
              ? "Group winners play the other group's lowest qualifier, teams from the same group can't meet in this round, and each group's top two start in opposite halves of the draw."
              : "The top seed plays the lowest qualifier, and the top two can only meet in the final."
          }
        />
      )}

      <RoundDetails />
      {plan.blocked && <Alert>{plan.blocked}</Alert>}
      <SubmitButton disabled={Boolean(plan.blocked) || !chosen} pendingText="Creating…">
        Create {chosen ? (chosen.pairings.length === 1 ? "the final" : `the ${chosen.stage.toLowerCase()}s`) : "round"}
      </SubmitButton>
    </ActionForm>
  );
}

function NextRound({ seasonId, plan }: { seasonId: number; plan: Extract<KnockoutPlan, { kind: "next" }> }) {
  const final = plan.stage === "Final";
  const [third, setThird] = useState(true);
  return (
    <ActionForm action={createNextKnockoutRoundAction} fields={{ seasonId }} className="space-y-4">
      <Preview title={`${final ? "Final" : `${plan.stage}s`}: winners of the ${plan.from.toLowerCase()}s`} pairings={plan.pairings} />
      {final && plan.thirdPlace && (
        <div className="space-y-2">
          <Checkbox name="thirdPlace" checked={third} onChange={(e) => setThird(e.target.checked)} label="Also create a third-place match between the semi-final losers" />
          {third && <Preview pairings={[plan.thirdPlace]} />}
        </div>
      )}
      <RoundDetails />
      {plan.blocked && <Alert>{plan.blocked}</Alert>}
      <SubmitButton disabled={Boolean(plan.blocked)} pendingText="Creating…">
        Create {final ? "the final" : `the ${plan.stage.toLowerCase()}s`}
      </SubmitButton>
    </ActionForm>
  );
}

/** Optional date, kick-off and venue for every match in the new round. */
function RoundDetails() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Field label="Date (optional)">
        <Input name="date" type="date" />
      </Field>
      <Field label="Kick-off (optional)">
        <Input name="kickoff" type="time" />
      </Field>
      <Field label="Venue (optional)" className="col-span-2">
        <Input name="venue" maxLength={80} placeholder="Can be set per match later" />
      </Field>
    </div>
  );
}

function Preview({ title, pairings, note }: { title?: string; pairings: Pairing[]; note?: string }) {
  return (
    <div>
      {title && <p className="mb-2 text-sm font-semibold">{title}</p>}
      <ol className="divide-y divide-border rounded-xl border border-border">
        {pairings.map((p, i) => (
          <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2 text-sm">
            <span className="num text-xs text-muted">{i + 1}</span>
            <Side seed={p.home} align="right" />
            <span className="text-xs text-muted">v</span>
            <Side seed={p.away} />
          </li>
        ))}
      </ol>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
  );
}

function Side({ seed, align }: { seed: Pairing["home"]; align?: "right" }) {
  return (
    <span className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <span className={`block truncate font-medium ${seed.teamId ? "" : "text-muted"}`}>{seed.name}</span>
      <span className="block text-[11px] uppercase tracking-wide text-muted">{seed.label}</span>
    </span>
  );
}
