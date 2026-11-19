import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SeasonForm } from "@/components/official";
import { Badge, EmptyState, LinkButton, PageHeader, Section } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { countsFor, featuredSeason, seasonCounts } from "@/lib/insights";
import { listSeasons } from "@/lib/league";
import { FORMAT_LABEL } from "@/lib/types";
import { canManageLeague } from "@/lib/users";

export const metadata: Metadata = { title: "Official panel" };

export default async function OfficialHome() {
  const me = await getCurrentUser();
  if (!me) redirect("/signin?next=/official");

  if (!canManageLeague(me)) {
    return (
      <div className="mx-auto max-w-lg">
        <EmptyState icon="🔒" title="Officials only">
          <p>
            You&apos;re signed in as a fan. Officials manage teams, fixtures and results. If you help run the
            Peace Cup, ask the admin to make your account an official.
          </p>
          <LinkButton href="/" variant="primary" className="mt-4">Back to the home page</LinkButton>
        </EmptyState>
      </div>
    );
  }

  const db = getDb();
  const [list, counts] = await Promise.all([listSeasons(db), seasonCounts(db)]);
  const seasons = list.map((s) => {
    const n = countsFor(counts, s.id);
    return { ...s, teams: n.teams, groups: n.groups, fixtures: n.matches, results: n.played };
  });

  const featured = await featuredSeason(db);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Official panel"
        subtitle={`Signed in as ${me.name}`}
        actions={me.role === "admin" ? <LinkButton href="/official/users">👥 Users &amp; roles</LinkButton> : undefined}
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Seasons</h2>
        {seasons.length === 0 ? (
          <EmptyState icon="🏆">No seasons yet. Create the first one below.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {seasons.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className="min-w-0 truncate">{s.name}</span>
                    {featured?.season.id === s.id && (
                      <Badge tone="success">{featured.reason === "pinned" ? "📌 Home page (pinned)" : "🏠 Home page"}</Badge>
                    )}
                  </p>
                  <p className="text-sm text-muted">
                    {FORMAT_LABEL[s.format]} · {s.teams} teams{s.format === "groups" ? ` in ${s.groups} groups` : ""} · {s.fixtures} matches · {s.results} played
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex">
                  <LinkButton href={`/season/${s.id}`}>View</LinkButton>
                  <LinkButton href={`/official/season/${s.id}`}>Manage</LinkButton>
                  <LinkButton href={`/official/season/${s.id}/matches`} variant="primary">Results</LinkButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Section title="Create a new season">
        <SeasonForm />
      </Section>
    </div>
  );
}
