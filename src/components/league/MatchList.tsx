import Link from "next/link";
import { EmptyState } from "@/components/ui";
import type { Match } from "@/lib/types";
import { MatchDayList } from "./MatchDayList";
import { MatchMeta } from "./MatchTag";
import { Scoreline } from "./Scoreline";

/** Read-only list of matches by date; each row links to the match page. */
export function MatchList({
  matches,
  emptyText,
  newestFirst = false,
  hrefFor,
}: {
  matches: Match[];
  emptyText: string;
  newestFirst?: boolean;
  hrefFor?: (m: Match) => string;
}) {
  if (matches.length === 0) return <EmptyState icon="📅">{emptyText}</EmptyState>;

  return (
    <MatchDayList
      matches={matches}
      newestFirst={newestFirst}
      renderMatch={(m) => {
        const body = (
          <div className="px-3 py-3 sm:px-4">
            <Scoreline match={m} />
            <div className="mt-1.5 flex justify-center">
              <MatchMeta match={m} showKickoff={m.played} />
            </div>
          </div>
        );
        const href = hrefFor?.(m);
        return href ? <Link href={href} className="block hover:bg-surface-2">{body}</Link> : body;
      }}
    />
  );
}
