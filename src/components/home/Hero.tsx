import { CalendarDays, ChartColumn, Clock, ListChecks, ListOrdered, MapPin, Shirt, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { PitchLines } from "@/components/auth";
import { formatDate } from "@/lib/format";
import { FORMAT_LABEL, type Match, type Season } from "@/lib/types";
import { Countdown } from "./Countdown";

/** Welcome banner with the featured season and a spotlight on the next match. */
export function Hero({
  season,
  nextMatch,
  signedIn,
  name,
  champion,
}: {
  season: Season | null;
  nextMatch: Match | null;
  signedIn: boolean;
  name?: string;
  /** Shown in the spotlight when there's no next match and the season has a winner. */
  champion?: { label: string; name: string } | null;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-brand text-brand-fg">
      <PitchLines />
      <div className="relative grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest opacity-80">
            {signedIn && name ? `Welcome back, ${name.split(" ")[0]}` : "Football for unity"}
          </p>
          <h1 className="mt-2 text-3xl font-black leading-tight sm:text-5xl">
            Tournament <span className="block">Management System</span>
          </h1>
          <p className="mt-3 max-w-md text-base opacity-90 sm:text-lg">
            One community, one ball. Follow every goal, every table and every fair-play moment of the season.
          </p>
          {season && (
            <p className="mt-4 inline-flex flex-wrap items-center gap-x-2 rounded-xl bg-white/15 px-3 py-1.5 text-sm">
              <span className="font-semibold">{season.name}</span>
              <span className="opacity-80">· {FORMAT_LABEL[season.format]}</span>
            </p>
          )}
          {season && (
            <nav aria-label="Season pages" className="mt-5 grid grid-cols-5 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
              <HeroLink href={`/season/${season.id}`} icon={ListOrdered} solid>Table</HeroLink>
              <HeroLink href={`/season/${season.id}/fixtures`} icon={CalendarDays}>Fixtures</HeroLink>
              <HeroLink href={`/season/${season.id}/results`} icon={ListChecks}>Results</HeroLink>
              <HeroLink href={`/season/${season.id}/stats`} icon={ChartColumn}>Stats</HeroLink>
              <HeroLink href={`/season/${season.id}/teams`} icon={Shirt}>Teams</HeroLink>
            </nav>
          )}
        </div>

        <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur-sm sm:p-5">
          {nextMatch ? (
            <Link href={season ? `/season/${season.id}/match/${nextMatch.id}` : "#"} className="block">
              <p className="text-center text-xs font-semibold uppercase tracking-widest opacity-80">
                Next match{nextMatch.stage ? ` · ${nextMatch.stage}` : nextMatch.groupName ? ` · ${nextMatch.groupName}` : ""}
              </p>
              <div className="my-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-center">
                <TeamBadge name={nextMatch.home.name} />
                <span className="text-sm font-bold opacity-80">VS</span>
                <TeamBadge name={nextMatch.away.name} />
              </div>
              {nextMatch.date ? (
                <>
                  <Countdown date={nextMatch.date} kickoff={nextMatch.kickoff} />
                  <p className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-sm opacity-90">
                    <span className="inline-flex items-center gap-1"><CalendarDays size={14} aria-hidden />{formatDate(nextMatch.date)}</span>
                    {nextMatch.kickoff && <span className="inline-flex items-center gap-1"><Clock size={14} aria-hidden />{nextMatch.kickoff}</span>}
                    {nextMatch.venue && <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden />{nextMatch.venue}</span>}
                  </p>
                </>
              ) : (
                <p className="text-center text-sm opacity-90">Date to be confirmed</p>
              )}
            </Link>
          ) : (
            <div className="py-6 text-center">
              <Trophy size={40} className={`mx-auto ${champion ? "text-[#f5c518]" : "opacity-90"}`} aria-hidden />
              {champion ? (
                <>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-widest opacity-80">{champion.label}</p>
                  <p className="mt-1 text-2xl font-black">{champion.name}</p>
                </>
              ) : (
                <>
                  <p className="mt-2 font-semibold">{season ? "No upcoming matches" : "The season starts soon"}</p>
                  <p className="text-sm opacity-80">{season ? "Check the results and final table." : "Fixtures will appear here."}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function HeroLink({ href, icon: Icon, children, solid }: { href: string; icon: LucideIcon; children: React.ReactNode; solid?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold transition sm:min-h-11 sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-3.5 sm:text-sm ${
        solid ? "bg-white text-[var(--brand)] hover:opacity-90" : "ring-1 ring-white/40 hover:bg-white/10"
      }`}
    >
      <Icon size={16} aria-hidden />
      {children}
    </Link>
  );
}

/** Circle with the team's initials, a stand-in for a crest. */
export function TeamBadge({ name, size = "lg" }: { name: string; size?: "sm" | "lg" }) {
  const letters = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <span
        aria-hidden
        className={`grid place-items-center rounded-full bg-white font-black text-[var(--brand)] shadow ${
          size === "lg" ? "h-14 w-14 text-lg sm:h-16 sm:w-16" : "h-9 w-9 text-xs"
        }`}
      >
        {letters}
      </span>
      <span className="line-clamp-2 text-sm font-semibold leading-tight sm:text-base">{name}</span>
    </div>
  );
}
