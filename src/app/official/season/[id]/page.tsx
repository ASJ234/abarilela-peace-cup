import type { Metadata } from "next";
import { addTeamsAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { GroupManager, TeamList } from "@/components/official";
import { Alert, Field, LinkButton, Section, Select, Textarea } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listGroups, listTeams } from "@/lib/league";
import { countPlayersByTeam } from "@/lib/players";
import { loadSeasonForOfficial } from "./data";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsAndGroups({ params }: { params: Promise<{ id: string }> }) {
  const season = await loadSeasonForOfficial(params);
  const db = getDb();
  const isGroups = season.format === "groups";
  // Groups only matter in the group-stage format.
  const groups = isGroups ? (await listGroups(db, season.id)) : [];
  const teams = await listTeams(db, season.id);

  return (
    <div className="space-y-6">
      <Section
        title="Teams"
        description={
          isGroups
            ? "Add teams, put them in groups, and open each team's squad to register its players."
            : "Add teams and open each team's squad to register its players. All teams play in one league table."
        }
      >
        <ActionForm action={addTeamsAction} fields={{ seasonId: season.id }}>
          <Field label="Add teams" hint="One per line, or separated by commas.">
            <Textarea name="names" rows={3} required placeholder={"Abarilela United\nRiverside FC, Hill Stars, Market Rangers"} />
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            {groups.length > 0 && (
              <Field label="Put them in" className="flex-1 sm:flex-none">
                <Select name="groupId">
                  <option value="">No group</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
              </Field>
            )}
            <SubmitButton pendingText="Adding…">Add teams</SubmitButton>
          </div>
        </ActionForm>

        {teams.length > 0 && (
          <div className="mt-5">
            <TeamList
              teams={teams}
              groups={groups}
              squadSize={await countPlayersByTeam(db, season.id)}
              squadHref={(id) => `/official/season/${season.id}/teams/${id}`}
            />
          </div>
        )}
      </Section>

      {isGroups ? (
        <Section
          title="Groups"
          description="Each group gets its own table. Teams play every other team in their group once."
        >
          <GroupManager seasonId={season.id} groups={groups} teams={teams} />
        </Section>
      ) : (
        <Alert tone="info" className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>League format:</strong> one table, every team plays every other team home and away. Want groups
            instead? Switch the format to <em>Group stage</em> in Settings.
          </span>
          <LinkButton href={`/official/season/${season.id}/settings`} size="sm">Settings</LinkButton>
        </Alert>
      )}
    </div>
  );
}
