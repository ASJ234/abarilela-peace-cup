import type { Metadata } from "next";
import { deleteSeasonAction } from "@/app/actions";
import { DeleteButton } from "@/components/forms";
import { HomePagePin, SeasonForm } from "@/components/official";
import { Section } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { featuredSeason } from "@/lib/insights";
import { leagueFixtureCount } from "@/lib/matches";
import { loadSeasonForOfficial } from "../data";

export const metadata: Metadata = { title: "Season settings" };

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const season = await loadSeasonForOfficial(params);
  const db = getDb();
  const fixtures = leagueFixtureCount(db, season.id);
  const featured = featuredSeason(db);
  const me = await getCurrentUser();
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
          canPin={me?.role === "admin"}
        />
      </Section>

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
    </div>
  );
}
