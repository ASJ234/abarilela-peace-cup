import { ListChecks, ListOrdered, Medal, ShieldCheck, Target } from "lucide-react";
import {
  About, BallIcon, Competitions, FairPlay, Hero, HomeCard, MatchMiniList, MiniTable, Podium, Records, StatStrip, UpcomingStrip,
  YourTeam, cardIcon,
} from "@/components/home";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  countsFor, fairPlay, featuredSeason, latestResults, seasonCounts, seasonNumbers, seasonRecords, teamSnapshot, upcoming,
} from "@/lib/insights";
import { getSeason, getTeam, listSeasons } from "@/lib/league";
import { seasonChampions } from "@/lib/knockout";
import { getTables, listMatches } from "@/lib/matches";
import { topAssists, topScorers } from "@/lib/players";

export default async function Home() {
  const db = getDb();
  const me = await getCurrentUser();
  const seasons = await listSeasons(db);
  // Pinned by the admin, else the season with the next match, else the latest result, else the newest.
  const featured = (await featuredSeason(db))?.season ?? null;

  // A fan's favourite team may be in an older season; show it with its own season.
  const favTeam = me?.favouriteTeamId != null ? (await getTeam(db, me.favouriteTeamId)) : null;
  const favSeason = favTeam ? (await getSeason(db, favTeam.seasonId)) : null;
  const snapshot = favTeam && favSeason ? (await teamSnapshot(db, favTeam.id, favSeason)) : null;

  if (!featured) {
    return (
      <div className="space-y-6">
        <Hero season={null} nextMatch={null} signedIn={!!me} name={me?.name} />
        <About />
      </div>
    );
  }

  const matches = await listMatches(db, featured.id);
  const next = upcoming(matches, 1)[0] ?? null;
  const base = `/season/${featured.id}`;
  const counts = await seasonCounts(db);
  const competitions = seasons.map((s) => {
    const n = countsFor(counts, s.id);
    return { ...s, played: n.played, matches: n.matches, teams: n.teams };
  });

  const [tables, scorers, assists, fair, numbers, champions] = await Promise.all([
    getTables(db, featured), topScorers(db, featured.id, 3), topAssists(db, featured.id, 3), fairPlay(db, featured.id),
    seasonNumbers(db, featured.id), seasonChampions(db, featured),
  ]);
  // The league winner is the main prize in a league; the cup final in a group-stage season.
  const champion = champions.league
    ? { label: "League champions", name: champions.league.name }
    : champions.cup ? { label: "Cup winners", name: champions.cup.name } : null;

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <Hero season={featured} nextMatch={next} signedIn={!!me} name={me?.name} champion={champion} />
        {me && <YourTeam snapshot={snapshot} />}
        {/* The hero spotlights the next match; these are the ones after it. */}
        <UpcomingStrip matches={upcoming(matches, 5).slice(next ? 1 : 0)} seasonId={featured.id} href={`${base}/fixtures`} />
      </div>

      {/* Pairs of cards in rows, so both columns line up on wide screens. On phones they stack, most-wanted first. */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <HomeCard title={featured.format === "groups" ? "Group leaders" : "Top of the table"} icon={cardIcon(ListOrdered)} href={base} linkLabel="Full table">
          <MiniTable tables={tables} seasonId={featured.id} />
        </HomeCard>
        <HomeCard title="Latest results" icon={cardIcon(ListChecks)} href={`${base}/results`}>
          <MatchMiniList matches={latestResults(matches, 4)} seasonId={featured.id} empty="No results yet." />
        </HomeCard>
        <HomeCard title="Golden Boot race" icon={<BallIcon size={16} strokeWidth={2.25} />} href={`${base}/stats`}>
          <Podium stats={scorers} unit={["goal", "goals"]} seasonId={featured.id} empty="No goals yet. Who will score first?" />
        </HomeCard>
        <HomeCard title="Top playmakers" icon={cardIcon(Target)} href={`${base}/stats`}>
          <Podium stats={assists} unit={["assist", "assists"]} seasonId={featured.id} empty="No assists recorded yet." />
        </HomeCard>
        <HomeCard title="Fair Play award" icon={cardIcon(ShieldCheck)} href={`${base}/stats`} linkLabel="Discipline">
          <FairPlay rows={fair} />
        </HomeCard>
        <HomeCard title="Season records" icon={cardIcon(Medal)}>
          <Records records={seasonRecords(matches)} seasonId={featured.id} />
        </HomeCard>
      </div>

      <section aria-labelledby="season-numbers">
        <h2 id="season-numbers" className="mb-3 text-lg font-bold">{featured.name} in numbers</h2>
        <StatStrip n={numbers} />
      </section>

      {competitions.length > 1 && (
        <section aria-labelledby="all-competitions">
          <h2 id="all-competitions" className="mb-3 text-lg font-bold">All competitions</h2>
          <Competitions seasons={competitions} featuredId={featured.id} />
        </section>
      )}

      <About />
    </div>
  );
}
