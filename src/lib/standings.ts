import type { Match, Points, StandingRow } from "./types";

type Team = { id: number; name: string };

/**
 * Build a league table from teams and matches.
 *
 * Ordering, as in the Premier League: points, then goal difference, then
 * goals scored. Team name is the final tiebreaker so the order is stable.
 */
export function computeStandings(
  teams: Team[],
  matches: Match[],
  points: Points,
  zones: { highlightTop: number; relegation: number } = { highlightTop: 4, relegation: 0 },
): StandingRow[] {
  const rows = new Map<number, StandingRow>();
  for (const t of teams) {
    rows.set(t.id, {
      position: 0, teamId: t.id, name: t.name,
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
      form: [], zone: null,
    });
  }

  const played = matches
    .filter((m) => m.homeScore != null && m.awayScore != null)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.round - b.round);

  for (const m of played) {
    const home = rows.get(m.home.id);
    const away = rows.get(m.away.id);
    if (!home || !away) continue;
    record(home, m.homeScore!, m.awayScore!, points);
    record(away, m.awayScore!, m.homeScore!, points);
  }

  const table = [...rows.values()];
  for (const r of table) {
    r.goalDiff = r.goalsFor - r.goalsAgainst;
    r.form = r.form.slice(-5);
  }

  table.sort((a, b) =>
    b.points - a.points ||
    b.goalDiff - a.goalDiff ||
    b.goalsFor - a.goalsFor ||
    a.name.localeCompare(b.name));

  const n = table.length;
  table.forEach((r, i) => {
    r.position = i + 1;
    if (r.position <= zones.highlightTop) r.zone = "top";
    else if (zones.relegation > 0 && r.position > n - zones.relegation) r.zone = "relegation";
  });
  return table;
}

function record(row: StandingRow, scored: number, conceded: number, points: Points) {
  row.played++;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  if (scored > conceded) { row.won++; row.points += points.win; row.form.push("W"); }
  else if (scored < conceded) { row.lost++; row.points += points.loss; row.form.push("L"); }
  else { row.drawn++; row.points += points.draw; row.form.push("D"); }
}
