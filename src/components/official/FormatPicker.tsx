import type { Format } from "@/lib/types";

const OPTIONS: { value: Format; title: string; text: string; icon: string }[] = [
  {
    value: "league",
    icon: "📋",
    title: "League",
    text: "All teams in one table. Every team plays every other team home and away.",
  },
  {
    value: "groups",
    icon: "🗂️",
    title: "Group stage",
    text: "Teams split into groups, one table per group. Teams in a group meet once.",
  },
];

/** Radio cards for choosing the competition format. */
export function FormatPicker({ defaultValue, lockedReason }: { defaultValue: Format; lockedReason?: string }) {
  return (
    <fieldset disabled={!!lockedReason}>
      <legend className="mb-1 text-sm font-medium text-muted">Format</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-70"
          >
            <input type="radio" name="format" value={o.value} defaultChecked={defaultValue === o.value} className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]" />
            <span>
              <span className="font-semibold">
                <span aria-hidden>{o.icon}</span> {o.title}
              </span>
              <span className="mt-0.5 block text-sm text-muted">{o.text}</span>
            </span>
          </label>
        ))}
      </div>
      {lockedReason && <p className="mt-2 text-xs text-muted">🔒 {lockedReason}</p>}
    </fieldset>
  );
}
