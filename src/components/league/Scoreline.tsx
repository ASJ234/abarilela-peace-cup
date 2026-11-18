import type { Match } from "@/lib/types";

/** Home – score – Away. Long team names wrap onto two lines so they never push the score off-screen. */
export function Scoreline({ match: m, size = "md" }: { match: Match; size?: "md" | "lg" }) {
  const big = size === "lg";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
      <span className={`line-clamp-2 break-words text-right font-medium leading-tight ${big ? "text-base font-bold sm:text-2xl" : ""}`}>{m.home.name}</span>
      {m.played ? (
        <span className={`num rounded-md bg-brand text-center font-bold text-brand-fg ${big ? "px-3 py-1.5 text-2xl sm:px-4 sm:text-3xl" : "px-2.5 py-1"}`}>
          {m.homeScore} – {m.awayScore}
        </span>
      ) : (
        <span className={`num rounded-md bg-surface-2 text-center font-semibold text-muted ${big ? "px-4 py-2 text-xl" : "px-2.5 py-1 text-xs"}`}>
          {!big && m.kickoff ? m.kickoff : "vs"}
        </span>
      )}
      <span className={`line-clamp-2 break-words font-medium leading-tight ${big ? "text-base font-bold sm:text-2xl" : ""}`}>{m.away.name}</span>
    </div>
  );
}
