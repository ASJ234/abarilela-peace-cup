import { formatMinute } from "@/lib/format";
import { type EventType, type Match, type MatchEvent, type TimelineEntry, eventPerson, matchTimeline } from "@/lib/types";

export const EVENT_ICON: Record<EventType, string> = { goal: "⚽", own_goal: "⚽", yellow: "🟨", red: "🟥" };
export const EVENT_LABEL: Record<EventType, string> = {
  goal: "Goal",
  own_goal: "Own goal",
  yellow: "Yellow card",
  red: "Red card",
};
export const SECOND_YELLOW_LABEL = "Second yellow card (sent off)";

/** What a timeline entry is called: "Second yellow card (sent off)" for a second booking. */
export const entryLabel = (x: TimelineEntry) => (x.secondYellow ? SECOND_YELLOW_LABEL : EVENT_LABEL[x.event.type]);

/** A yellow card with a red card overlapping it, as match centres show a second booking. */
function SecondYellowIcon() {
  return (
    <span className="relative inline-block h-[1.1em] w-[1.45em] shrink-0 align-middle" aria-hidden>
      <span className="absolute left-0 top-0 h-[0.95em] w-[0.7em] -rotate-6 rounded-[2px] bg-yellow-400 ring-1 ring-black/10" />
      <span className="absolute left-[0.55em] top-[0.15em] h-[0.95em] w-[0.7em] rotate-6 rounded-[2px] bg-red-600 ring-1 ring-black/10" />
    </span>
  );
}

/**
 * Match timeline. Home events align left, away events right.
 * Own goals are shown on the side of the team credited with the goal. Penalties are marked
 * "(pen)", and cards given to a coach "(coach)". A second yellow and the red card it brings
 * are one row, with the two cards drawn overlapping.
 */
export function EventList({
  match,
  events,
  renderAction,
}: {
  match: Match;
  events: MatchEvent[];
  /** Optional control per timeline row (e.g. the officials' remove button). */
  renderAction?: (x: TimelineEntry) => React.ReactNode;
}) {
  if (events.length === 0) return <p className="text-sm text-muted">No goals or cards recorded.</p>;
  return (
    <ul className="divide-y divide-border">
      {matchTimeline(events).map((x) => {
        const e = x.event;
        const home = e.teamId === match.home.id;
        const label = entryLabel(x);
        return (
          <li key={e.id} className={`flex items-center gap-2 py-2 ${home ? "" : "flex-row-reverse text-right"}`}>
            <span className="num w-10 shrink-0 text-xs text-muted">{formatMinute(e)}</span>
            <span role="img" aria-label={label} title={label} className="inline-flex">
              {x.secondYellow ? <SecondYellowIcon /> : EVENT_ICON[e.type]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{eventPerson(e)}</span>
              {e.coach != null && <span className="text-muted"> (coach)</span>}
              {e.penalty && <span className="text-muted" title="Penalty"> (pen)</span>}
              {e.type === "own_goal" && <span className="text-muted"> (og)</span>}
              {x.secondYellow && <span className="text-muted"> (2nd yellow)</span>}
              {e.assist && <span className="text-muted" title="Assist"> ({e.assist.name})</span>}
            </span>
            {renderAction?.(x)}
          </li>
        );
      })}
    </ul>
  );
}
