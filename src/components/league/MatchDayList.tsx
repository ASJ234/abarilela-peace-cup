import { formatDate, groupBy } from "@/lib/format";
import type { Match } from "@/lib/types";

/**
 * Groups matches by date and renders each day with a header.
 * `renderMatch` decides what each row looks like, so the same layout serves the
 * public fixtures list and the official results entry.
 */
export function MatchDayList({
  matches,
  renderMatch,
  newestFirst = false,
  collapsePlayedDays = false,
}: {
  matches: Match[];
  renderMatch: (m: Match) => React.ReactNode;
  newestFirst?: boolean;
  /** Fold away days where every match has a result (official screens). */
  collapsePlayedDays?: boolean;
}) {
  let days = groupBy(matches, (m) => m.date);
  if (newestFirst) days = days.reverse();

  return (
    <div className="space-y-6">
      {days.map(([date, list]) => {
        const done = list.every((m) => m.played);
        return (
          <details key={date ?? "tbc"} open={!(collapsePlayedDays && done)} className="group">
            <summary className="mb-2 flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 text-sm [&::-webkit-details-marker]:hidden">
              <span className="font-semibold">
                <span aria-hidden className="mr-1 inline-block text-muted transition group-open:rotate-90">▸</span>
                {formatDate(date)}
                {collapsePlayedDays && done && <span className="ml-2 text-top">✓ all played</span>}
              </span>
              <span className="text-muted">{list.length} match{list.length === 1 ? "" : "es"}</span>
            </summary>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {list.map((m) => <li key={m.id}>{renderMatch(m)}</li>)}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
