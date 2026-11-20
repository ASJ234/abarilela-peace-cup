import { winnerOf } from "@/lib/knockout";
import type { Match } from "@/lib/types";

/**
 * Home – score – Away, with the shoot-out under the score when there was one. Long team names wrap onto two lines so they never push the score off-screen.
 * The winner (on goals, or on penalties after a level score) is bolded; a draw leaves both names alike.
 */
export function Scoreline({ match: m, size = "md" }: { match: Match; size?: "md" | "lg" }) {
  const big = size === "lg";
  const winnerId = winnerOf(m)?.id;
  // Big names are bold by default, so once there's a winner the loser drops back to medium.
  const nameWeight = (teamId: number) =>
    winnerId == null ? (big ? "font-bold" : "font-medium") : teamId === winnerId ? "font-bold" : "font-medium";
  const nameSize = big ? "text-base sm:text-2xl" : "";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
      <span className={`line-clamp-2 break-words text-right leading-tight ${nameWeight(m.home.id)} ${nameSize}`}>{m.home.name}</span>
      {m.played ? (
        <span className="flex flex-col items-center gap-0.5">
          <span className={`num rounded-md bg-brand text-center font-bold text-brand-fg ${big ? "px-3 py-1.5 text-2xl sm:px-4 sm:text-3xl" : "px-2.5 py-1"}`}>
            {m.homeScore} – {m.awayScore}
          </span>
          {m.homePens != null && m.awayPens != null && (
            <span className={`num whitespace-nowrap font-semibold text-muted ${big ? "text-sm" : "text-[11px]"}`} title="Penalty shoot-out">
              ({m.homePens}–{m.awayPens} pens)
            </span>
          )}
        </span>
      ) : (
        <span className={`num rounded-md bg-surface-2 text-center font-semibold text-muted ${big ? "px-4 py-2 text-xl" : "px-2.5 py-1 text-xs"}`}>
          {!big && m.kickoff ? m.kickoff : "vs"}
        </span>
      )}
      <span className={`line-clamp-2 break-words leading-tight ${nameWeight(m.away.id)} ${nameSize}`}>{m.away.name}</span>
    </div>
  );
}
