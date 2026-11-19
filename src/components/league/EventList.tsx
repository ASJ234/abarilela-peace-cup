import { formatMinute } from "@/lib/format";
import type { EventType, Match, MatchEvent } from "@/lib/types";

export const EVENT_ICON: Record<EventType, string> = { goal: "⚽", own_goal: "⚽", yellow: "🟨", red: "🟥" };
export const EVENT_LABEL: Record<EventType, string> = {
  goal: "Goal",
  own_goal: "Own goal",
  yellow: "Yellow card",
  red: "Red card",
};

/**
 * Match timeline. Home events align left, away events right.
 * Own goals are shown on the side of the team credited with the goal.
 */
export function EventList({
  match,
  events,
  renderAction,
}: {
  match: Match;
  events: MatchEvent[];
  /** Optional control per event (e.g. the officials' remove button). */
  renderAction?: (e: MatchEvent) => React.ReactNode;
}) {
  if (events.length === 0) return <p className="text-sm text-muted">No goals or cards recorded.</p>;
  return (
    <ul className="divide-y divide-border">
      {events.map((e) => {
        const home = e.teamId === match.home.id;
        return (
          <li key={e.id} className={`flex items-center gap-2 py-2 ${home ? "" : "flex-row-reverse text-right"}`}>
            <span className="num w-10 shrink-0 text-xs text-muted">{formatMinute(e)}</span>
            <span aria-label={EVENT_LABEL[e.type]} title={EVENT_LABEL[e.type]}>{EVENT_ICON[e.type]}</span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{e.player.name}</span>
              {e.type === "own_goal" && <span className="text-muted"> (og)</span>}
              {e.assist && <span className="block text-xs text-muted sm:inline sm:text-sm"> · assist {e.assist.name}</span>}
            </span>
            {renderAction?.(e)}
          </li>
        );
      })}
    </ul>
  );
}
