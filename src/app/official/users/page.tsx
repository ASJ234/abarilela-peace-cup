import type { Metadata } from "next";
import { setUserRoleAction } from "@/app/actions";
import { AutoSaveSelect } from "@/components/forms";
import { Badge, PageHeader, Section } from "@/components/ui";
import { getDb } from "@/lib/db";
import { initials } from "@/lib/format";
import { ROLE_LABEL, listUsers } from "@/lib/users";
import { requireAdmin } from "../access";

export const metadata: Metadata = { title: "Users & roles" };

const ROLE_OPTIONS = [
  { value: "fan", label: "Fan" },
  { value: "official", label: "Official" },
];

export default async function UsersPage() {
  const me = await requireAdmin("/official/users");
  const users = listUsers(getDb());
  const officials = users.filter((u) => u.role !== "fan").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & roles"
        subtitle={`${users.length} account${users.length === 1 ? "" : "s"} · ${officials} with official access`}
        back={{ href: "/official", label: "Official panel" }}
      />
      <Section
        title="Who can manage the league"
        description="Fans can follow a team. Officials can manage seasons, teams, fixtures and results. Changing someone to Fan signs them out of official tools straight away."
      >
        <ul className="divide-y divide-border rounded-lg border border-border">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 p-3">
              <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold">
                {initials(u.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {u.name} {u.id === me.id && <span className="text-sm text-muted">(you)</span>}
                </span>
                <span className="block truncate text-sm text-muted">{u.email}</span>
              </span>
              {u.role === "admin" ? (
                <Badge tone="brand">{ROLE_LABEL.admin}</Badge>
              ) : (
                <div className="w-full sm:w-36">
                  <AutoSaveSelect
                    action={setUserRoleAction}
                    fields={{ userId: u.id }}
                    name="role"
                    label={`Role for ${u.name}`}
                    defaultValue={u.role}
                    options={ROLE_OPTIONS}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
