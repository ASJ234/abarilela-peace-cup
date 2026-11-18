import type { Metadata } from "next";
import { deleteSeasonAction } from "@/app/actions";
import { DeleteButton } from "@/components/forms";
import { SeasonForm } from "@/components/official";
import { Section } from "@/components/ui";
import { getDb } from "@/lib/db";
import { leagueFixtureCount } from "@/lib/matches";
import { loadSeasonForOfficial } from "../data";

export const metadata: Metadata = { title: "Season settings" };

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const season = await loadSeasonForOfficial(params);
  const fixtures = leagueFixtureCount(getDb(), season.id);
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
