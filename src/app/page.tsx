import {
  About, Competitions, FairPlay, Hero, HomeCard, MatchMiniList, MiniTable, Podium, Records, StatStrip, YourTeam,
} from "@/components/home";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  countsFor, fairPlay, featuredSeason, latestResults, seasonCounts, seasonNumbers, seasonRecords, teamSnapshot, upcoming,
} from "@/lib/insights";
import { getSeason, getTeam, listSeasons } from "@/lib/league";
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

  return (
    <div className="space-y-6">
      <Hero season={featured} nextMatch={next} signedIn={!!me} name={me?.name} />

      {me && <YourTeam snapshot={snapshot} />}

      <StatStrip n={await seasonNumbers(db, featured.id)} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <HomeCard title="Latest results" icon="✅" href={`${base}/results`}>
            <MatchMiniList matches={latestResults(matches, 4)} seasonId={featured.id} empty="No results yet." />
          </HomeCard>
          <HomeCard title="Coming up" icon="📅" href={`${base}/fixtures`}>
            <MatchMiniList matches={upcoming(matches, 5).slice(next ? 1 : 0)} seasonId={featured.id} empty="Nothing else scheduled yet." />
          </HomeCard>
          <HomeCard title="Season records" icon="📜">
            <Records records={seasonRecords(matches)} seasonId={featured.id} />
          </HomeCard>
        </div>
        <div className="space-y-6">
          <HomeCard title={featured.format === "groups" ? "Group leaders" : "Top of the table"} icon="🏆" href={base} linkLabel="Full table">
            <MiniTable tables={await getTables(db, featured)} seasonId={featured.id} />
          </HomeCard>
          <HomeCard title="Golden Boot race" icon="⚽" href={`${base}/stats`}>
            <Podium stats={await topScorers(db, featured.id, 3)} unit="goals" seasonId={featured.id} empty="No goals yet. Who will score first?" />
          </HomeCard>
          <HomeCard title="Top playmakers" icon="🎯" href={`${base}/stats`}>
            <Podium stats={await topAssists(db, featured.id, 3)} unit="assists" seasonId={featured.id} empty="No assists recorded yet." />
          </HomeCard>
          <HomeCard title="Fair Play award" icon="🕊️" href={`${base}/stats`} linkLabel="Discipline">
            <FairPlay rows={await fairPlay(db, featured.id)} />
          </HomeCard>
        </div>
      </div>

      {competitions.length > 1 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">All competitions</h2>
          <Competitions seasons={competitions} />
        </section>
      )}

      <About />
    </div>
  );
}
