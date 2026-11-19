import { Trophy } from "lucide-react";
import Link from "next/link";
import type { Champions } from "@/lib/knockout";

/** "League champions" and/or "Cup winners", once decided. Renders nothing before then. */
export function ChampionsBanner({ champions, seasonId }: { champions: Champions; seasonId: number }) {
  const items = [
    champions.league && { label: "League champions", team: champions.league },
    champions.cup && { label: champions.league ? "Play-off winners" : "Cup winners", team: champions.cup },
  ].filter((x): x is { label: string; team: { id: number; name: string } } => Boolean(x));
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#d4a017]/50 bg-[#d4a017]/10 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
      {items.map(({ label, team }) => (
        <div key={label} className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#d4a017] text-white shadow">
            <Trophy size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
            <Link href={`/season/${seasonId}/teams/${team.id}`} className="block truncate text-lg font-black hover:underline">
              {team.name}
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
