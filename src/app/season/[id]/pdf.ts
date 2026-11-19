import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getSeason, listGroups, listTeams } from "@/lib/league";
import { listMatches } from "@/lib/matches";
import { fixturesPdf } from "@/lib/pdf";

const slug = (s: string) => s.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "fixtures";

/**
 * A team's fixtures (or, with no team, every team's, one after another) as a PDF
 * download. Public, like the rest of the season pages.
 */
export async function fixturesPdfResponse(seasonIdRaw: string, teamIdRaw?: string): Promise<Response> {
  const db = getDb();
  const season = await getSeason(db, Number(seasonIdRaw));
  if (!season) return new Response("Season not found", { status: 404 });

  const allTeams = await listTeams(db, season.id);
  const teams = teamIdRaw == null ? allTeams : allTeams.filter((t) => t.id === Number(teamIdRaw));
  if (teamIdRaw != null && teams.length === 0) return new Response("Team not found", { status: 404 });

  const groupName = new Map((await listGroups(db, season.id)).map((g) => [g.id, g.name]));
  const matches = await listMatches(db, season.id);
  const bytes = await fixturesPdf({
    seasonName: season.name,
    generatedOn: formatDate(new Date().toISOString().slice(0, 10)),
    teams: teams.map((t) => ({
      teamId: t.id,
      team: t,
      groupName: season.format === "groups" && t.groupId != null ? groupName.get(t.groupId) ?? null : null,
      matches: matches.filter((m) => m.home.id === t.id || m.away.id === t.id),
    })),
  });

  const name = teams.length === 1 ? `${slug(teams[0].name)}-fixtures-${slug(season.name)}.pdf` : `${slug(season.name)}-fixtures-by-team.pdf`;
  return new Response(new Blob([bytes as BlobPart], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
