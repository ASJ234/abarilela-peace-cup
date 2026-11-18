import type { Metadata } from "next";
import { AddUserForm, UserDirectory } from "@/components/admin";
import { Card, PageHeader, Section } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listTeamChoices } from "@/lib/league";
import { listUsers } from "@/lib/users";
import { requireAdmin } from "../access";

export const metadata: Metadata = { title: "Users & roles" };

export default async function UsersPage() {
  const me = await requireAdmin("/official/users");
  const db = getDb();
  const users = listUsers(db);
  const teams = listTeamChoices(db);
  const officials = users.filter((u) => u.role === "official").length;
  const fans = users.filter((u) => u.role === "fan").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & roles"
        subtitle={`${users.length} account${users.length === 1 ? "" : "s"}: 1 admin · ${officials} official${officials === 1 ? "" : "s"} · ${fans} fan${fans === 1 ? "" : "s"}`}
        back={{ href: "/official", label: "Official panel" }}
      />

      <Card>
        <details open={users.length <= 1} className="group p-4 sm:p-6">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-lg font-semibold [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="text-muted transition group-open:rotate-90">▸</span> Add a user
          </summary>
          <p className="mb-4 mt-1 text-sm text-muted">
            Create an account for an official (or a fan) and give them the username and password.
          </p>
          <AddUserForm teams={teams} />
        </details>
      </Card>

      <Section
        title="All users"
        description="Fans follow a team. Officials manage seasons, teams, fixtures and results. There is one admin."
      >
        <UserDirectory users={users} meId={me.id} teams={teams} />
      </Section>
    </div>
  );
}
