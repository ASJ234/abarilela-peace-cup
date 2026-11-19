import type { Metadata } from "next";
import { AddUserForm, UserDirectory } from "@/components/admin";
import { Collapsible, PageHeader, Section } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listTeamChoices } from "@/lib/league";
import { seasonsByOfficial } from "@/lib/officials";
import { listUsers } from "@/lib/users";
import { requireAdmin } from "../access";

export const metadata: Metadata = { title: "Users & roles" };

export default async function UsersPage() {
  const me = await requireAdmin("/official/users");
  const db = getDb();
  const users = await listUsers(db);
  const teams = await listTeamChoices(db);
  const seasons = Object.fromEntries(await seasonsByOfficial(db));
  const officials = users.filter((u) => u.role === "official").length;
  const fans = users.filter((u) => u.role === "fan").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & roles"
        subtitle={`${users.length} account${users.length === 1 ? "" : "s"}: 1 admin · ${officials} official${officials === 1 ? "" : "s"} · ${fans} fan${fans === 1 ? "" : "s"}`}
        back={{ href: "/official", label: "Official panel" }}
      />

      <Collapsible title="Add a user" defaultOpen={users.length <= 1}>
        <p className="mb-4 mt-1 text-sm text-muted">
          Create an account for an official (or a fan) and give them the username and password.
        </p>
        <AddUserForm teams={teams} />
      </Collapsible>

      <Section
        title="All users"
        description="Officials manage the seasons you add them to (in each season's Settings). Fans follow a team. There is one admin."
      >
        <UserDirectory users={users} meId={me.id} teams={teams} seasons={seasons} />
      </Section>
    </div>
  );
}
