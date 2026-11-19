import { Badge } from "@/components/ui";
import type { Match } from "@/lib/types";

/** Which group / stage / matchday a match belongs to. */
export function MatchTag({ match }: { match: Match }) {
  if (match.stage) return <Badge tone="brand">{match.stage}</Badge>;
  const label = [match.groupName, match.round > 0 ? `MD${match.round}` : null].filter(Boolean).join(" · ");
  return label ? <Badge>{label}</Badge> : null;
}

/** "📍 Venue · 15:00" style details line (with the referee when `showReferee`). */
export function MatchMeta({ match, showKickoff = true, showReferee = false }: { match: Match; showKickoff?: boolean; showReferee?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <MatchTag match={match} />
      {showKickoff && match.kickoff && <span>{match.kickoff}</span>}
      {match.venue && <span>📍 {match.venue}</span>}
      {showReferee && match.referee && <span title="Referee">🧑‍⚖️ Referee: {match.referee}</span>}
    </span>
  );
}
