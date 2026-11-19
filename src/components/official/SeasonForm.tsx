import { createSeasonAction, updateSeasonAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import type { Season } from "@/lib/types";
import { FormatPicker } from "./FormatPicker";

/**
 * Create a season (no `season`) or edit an existing one's settings.
 * `formatLockedReason` disables the format choice (e.g. fixtures already exist).
 */
export function SeasonForm({ season, formatLockedReason }: { season?: Season; formatLockedReason?: string }) {
  const d = season ?? { name: "", format: "league" as const, points: { win: 3, draw: 1, loss: 0 }, highlightTop: 4, relegation: 0 };
  return (
    <ActionForm
      action={season ? updateSeasonAction : createSeasonAction}
      fields={season ? { seasonId: season.id } : undefined}
      className="space-y-4"
    >
      <Field label="Season name">
        <Input name="name" required maxLength={80} defaultValue={d.name} placeholder="e.g. Champions Cup 2026/27" />
      </Field>

      <FormatPicker defaultValue={d.format} lockedReason={formatLockedReason} />

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-muted">Points awarded</legend>
        <div className="grid grid-cols-3 gap-3">
          <NumberField name="win" label="Win" value={d.points.win} />
          <NumberField name="draw" label="Draw" value={d.points.draw} />
          <NumberField name="loss" label="Loss" value={d.points.loss} />
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField name="highlightTop" label="Highlight top places (per table)" value={d.highlightTop} max={50} />
        <NumberField name="relegation" label="Mark bottom places (0 = none)" value={d.relegation} max={50} />
      </div>

      <SubmitButton>{season ? "Save settings" : "Create season"}</SubmitButton>
    </ActionForm>
  );
}

function NumberField({ name, label, value, max = 10 }: { name: string; label: string; value: number; max?: number }) {
  return (
    <Field label={label}>
      <Input name={name} type="number" inputMode="numeric" min={0} max={max} step={1} required defaultValue={value} className="num" />
    </Field>
  );
}
