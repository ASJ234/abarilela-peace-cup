import { Badge } from "@/components/ui";
import type { Match } from "@/lib/types";

/** Which group / stage / matchday a match belongs to. */
export function MatchTag({ match }: { match: Match }) {
  if (match.stage) return <Badge tone="brand">{match.stage}</Badge>;
  const label = [match.groupName, match.round > 0 ? `MD${match.round}` : null].filter(Boolean).join(" · ");
  return label ? <Badge>{label}</Badge> : null;
}

/** "📍 Venue · 15:00" style details line. */
export function MatchMeta({ match, showKickoff = true }: { match: Match; showKickoff?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <MatchTag match={match} />
      {showKickoff && match.kickoff && <span>{match.kickoff}</span>}
      {match.venue && <span>📍 {match.venue}</span>}
    </span>
  );
}
