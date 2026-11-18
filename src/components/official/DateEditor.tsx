"use client";

import { useActionState, useState } from "react";
import { saveDatesAction } from "@/app/actions";
import { FormMessage, HiddenFields, SubmitButton } from "@/components/forms";
import { Button, ConfirmDialog, Field, Input } from "@/components/ui";
import { formatDate } from "@/lib/format";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Builds the list of playing dates, one at a time or by quick-filling a
 * regular schedule. Changes are local until "Save dates".
 */
export function DateEditor({
  seasonId,
  initialDates,
  needed,
}: {
  seasonId: number;
  initialDates: string[];
  /** Dates needed with one matchday per date. */
  needed: number;
}) {
  const [dates, setDates] = useState<string[]>(initialDates);
  const [single, setSingle] = useState("");
  const [start, setStart] = useState("");
  const [every, setEvery] = useState(7);
  const [howMany, setHowMany] = useState(Math.max(needed, 1));
  const [confirmClear, setConfirmClear] = useState(false);
  const [state, action] = useActionState(saveDatesAction, undefined);

  const dirty = dates.join() !== initialDates.join();
  const put = (list: string[]) => setDates([...new Set(list)].sort());

  return (
    <form action={action} className="space-y-4">
      <HiddenFields fields={{ seasonId }} />
      {dates.map((d) => <input key={d} type="hidden" name="date" value={d} />)}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-sm font-semibold">Add a single date</p>
          <div className="flex gap-2">
            <Input type="date" value={single} onChange={(e) => setSingle(e.target.value)} aria-label="Playing date" />
            <Button type="button" variant="secondary" disabled={!single} onClick={() => { put([...dates, single]); setSingle(""); }}>
              Add
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-sm font-semibold">Quick fill a regular schedule</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="First date" className="col-span-2 sm:col-span-1">
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Every (days)">
              <Input type="number" inputMode="numeric" min={1} max={60} value={every} onChange={(e) => setEvery(Number(e.target.value))} className="num" />
            </Field>
            <Field label="How many">
              <Input type="number" inputMode="numeric" min={1} max={200} value={howMany} onChange={(e) => setHowMany(Number(e.target.value))} className="num" />
            </Field>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="mt-2 w-full sm:w-auto"
            disabled={!start || every < 1 || howMany < 1}
            onClick={() => put([...dates, ...Array.from({ length: howMany }, (_, i) => addDays(start, i * every))])}
          >
            Add {howMany} dates
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            <strong>{dates.length}</strong> date{dates.length === 1 ? "" : "s"} entered
            {needed > 0 && (
              <span className={dates.length >= needed ? "text-top" : "text-muted"}>
                {" "}· one matchday per date needs {needed}
              </span>
            )}
          </span>
          {dates.length > 0 && (
            <Button type="button" variant="ghost" size="sm" className="text-rel" onClick={() => setConfirmClear(true)}>
              Clear all
            </Button>
          )}
        </div>
        {dates.length === 0 ? (
          <p className="text-sm text-muted">No dates yet.</p>
        ) : (
          <ol className="flex flex-wrap gap-2">
            {dates.map((d, i) => (
              <li key={d} className="flex items-center gap-1 rounded-full bg-brand-soft py-0.5 pl-3 pr-0.5 text-sm">
                <span className="text-xs text-muted">MD{i + 1}</span>
                <span>{formatDate(d)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${formatDate(d)}`}
                  className="grid h-8 w-8 place-items-center rounded-full text-lg leading-none hover:bg-surface"
                  onClick={() => setDates(dates.filter((x) => x !== d))}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <FormMessage state={dirty ? undefined : state} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton
          confirm={
            initialDates.some((d) => !dates.includes(d))
              ? {
                  title: "Remove playing dates?",
                  message: `${initialDates.filter((d) => !dates.includes(d)).length} saved date(s) will be removed. Fixtures already scheduled keep their dates.`,
                  confirmLabel: "Save and remove",
                }
              : undefined
          }
        >
          Save dates
        </SubmitButton>
        {dirty && (
          <>
            <span className="text-sm text-muted">Unsaved changes</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDates(initialDates)}>Undo</Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all dates?"
        message="This empties the list. Nothing is saved until you press “Save dates”, and you can still undo."
        confirmLabel="Clear all"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => { setDates([]); setConfirmClear(false); }}
      />
    </form>
  );
}
