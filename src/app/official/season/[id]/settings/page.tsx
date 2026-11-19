import type { Metadata } from "next";
import { deleteSeasonAction } from "@/app/actions";
import { DeleteButton } from "@/components/forms";
import { HomePagePin, SeasonForm, SeasonOfficials } from "@/components/official";
import { Section } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { featuredSeason } from "@/lib/insights";
import { leagueFixtureCount } from "@/lib/matches";
import { listSeasonOfficials } from "@/lib/officials";
import { listUsers } from "@/lib/users";
import { loadSeasonForOfficial } from "../data";

export const metadata: Metadata = { title: "Season settings" };

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const season = await loadSeasonForOfficial(params);
  const db = getDb();
  const fixtures = await leagueFixtureCount(db, season.id);
  const featured = await featuredSeason(db);
  const me = await getCurrentUser();
  const isAdmin = me?.role === "admin";
  const [assigned, officials] = isAdmin
    ? await Promise.all([listSeasonOfficials(db, season.id), listUsers(db).then((us) => us.filter((u) => u.role === "official"))])
    : [[], []];
  return (
    <div className="space-y-6">
      <Section title="Season settings">
        <SeasonForm
          season={season}
          formatLockedReason={
            fixtures > 0
              ? `The format can't change while ${fixtures} league/group fixtures exist. Clear them on the Schedule tab first.`
              : undefined
          }
        />
      </Section>

      <Section
        title="Home page"
        description="The home page features one season: the one the admin pins, or else the season with the soonest upcoming match."
      >
        <HomePagePin
          seasonId={season.id}
          seasonName={season.name}
          featured={featured && { id: featured.season.id, name: featured.season.name, reason: featured.reason }}
          canPin={isAdmin}
        />
      </Section>

      {isAdmin && (
        <Section
          title="Officials"
          description="Officials on this season can see and manage it: teams, squads, schedule, matches, results and settings. They can't see other seasons."
        >
          <SeasonOfficials seasonId={season.id} assigned={assigned} officials={officials} />
        </Section>
      )}

      {isAdmin && (
      <Section
        tone="danger"
        title="Delete season"
        description="Permanently deletes this season with all its groups, teams, players, fixtures, results and stats."
      >
        <DeleteButton
          action={deleteSeasonAction}
          fields={{ seasonId: season.id }}
          what={`"${season.name}"`}
          label="Delete season"
          size="md"
          detail="Everything in this season (groups, teams, players, fixtures, results and stats) will be permanently deleted. This can't be undone."
        />
      </Section>
      )}
    </div>
  );
}
