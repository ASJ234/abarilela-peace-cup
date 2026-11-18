import Link from "next/link";
import { FormGuide, Scoreline } from "@/components/league";
import { Card, LinkButton } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { FairPlayRow, SeasonNumbers, SeasonRecords, TeamSnapshot } from "@/lib/insights";
import { FORMAT_LABEL, type GroupTable, type Match, type PlayerStat, type Season } from "@/lib/types";

/** Card with a heading and an optional "see all" link. */
export function HomeCard({
  title,
  icon,
  href,
  linkLabel = "See all",
  children,
  className = "",
}: {
  title: string;
  icon?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-bold">
          {icon && <span aria-hidden className="mr-1.5">{icon}</span>}
          {title}
        </h2>
        {href && (
          <Link href={href} className="text-sm font-semibold text-brand hover:underline">
            {linkLabel} →
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function StatStrip({ n }: { n: SeasonNumbers }) {
  const tiles: { label: string; value: string | number; icon: string }[] = [
    { icon: "👥", label: "Teams", value: n.teams },
    { icon: "🏃", label: "Players", value: n.players },
    { icon: "📅", label: "Played", value: `${n.played}/${n.matches}` },
    { icon: "⚽", label: "Goals", value: n.goals },
    { icon: "📈", label: "Goals / match", value: n.goalsPerMatch },
    { icon: "🟥", label: "Red cards", value: n.red },
  ];
  return (
    <ul className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <li key={t.label} className="rounded-xl border border-border bg-surface px-2 py-3 text-center">
          <p aria-hidden className="text-lg">{t.icon}</p>
          <p className="num text-xl font-black sm:text-2xl">{t.value}</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t.label}</p>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------

export function MatchMiniList({ matches, seasonId, empty }: { matches: Match[]; seasonId: number; empty: string }) {
  if (matches.length === 0) return <p className="px-4 py-6 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {matches.map((m) => (
        <li key={m.id}>
          <Link href={`/season/${seasonId}/match/${m.id}`} className="block px-3 py-3 hover:bg-surface-2 sm:px-4">
            <p className="mb-1.5 text-center text-xs text-muted">
              {formatDate(m.date, { year: false })}
              {m.stage ? ` · ${m.stage}` : m.groupName ? ` · ${m.groupName}` : ""}
            </p>
            <Scoreline match={m} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------

/** Top of the table (league) or the leaders of each group. */
export function MiniTable({ tables, seasonId, rows = 5 }: { tables: GroupTable[]; seasonId: number; rows?: number }) {
  const grouped = tables.length > 1 || tables[0]?.group != null;
  return (
    <div className="divide-y divide-border">
      {tables.map((t) => (
        <div key={t.group?.id ?? "league"}>
          {grouped && <p className="bg-surface-2 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{t.group?.name}</p>}
          <table className="num w-full text-sm">
            <tbody>
              {t.rows.slice(0, grouped ? 2 : rows).map((r) => (
                <tr key={r.teamId} className={`border-t border-border first:border-t-0 ${r.zone === "top" ? "bg-top-bg" : ""}`}>
                  <td className="w-9 py-2 pl-4 font-semibold">{r.position}</td>
                  <td className="max-w-0 truncate py-2 pr-2 font-medium">
                    <Link href={`/season/${seasonId}/teams/${r.teamId}`} className="hover:underline">{r.name}</Link>
                  </td>
                  <td className="w-10 py-2 text-center text-muted" title="Played">{r.played}</td>
                  <td className="hidden w-10 py-2 text-center text-muted sm:table-cell" title="Goal difference">
                    {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                  </td>
                  <td className="w-12 py-2 pr-4 text-center font-black" title="Points">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Podium-style top 3 for a stat, e.g. the Golden Boot race. */
export function Podium({ stats, unit, seasonId, empty }: { stats: PlayerStat[]; unit: string; seasonId: number; empty: string }) {
  if (stats.length === 0) return <p className="px-4 py-6 text-sm text-muted">{empty}</p>;
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <ol className="divide-y divide-border">
      {stats.slice(0, 3).map((s, i) => (
        <li key={s.playerId} className="flex items-center gap-3 px-4 py-2.5">
          <span aria-hidden className="text-xl">{medal[i]}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{s.name}</span>
            <Link href={`/season/${seasonId}/teams/${s.teamId}`} className="block truncate text-xs text-muted hover:underline">
              {s.teamName}
            </Link>
          </span>
          <span className="num text-right">
            <span className="text-xl font-black">{s.count}</span>
            <span className="ml-1 text-xs text-muted">{unit}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------

/** Fewest card points (yellow 1, red 3) leads the Fair Play race. */
export function FairPlay({ rows }: { rows: FairPlayRow[] }) {
  if (rows.length === 0) return <p className="px-4 py-6 text-sm text-muted">The race starts after the first match.</p>;
  return (
    <div>
      <p className="px-4 pt-3 text-xs text-muted">Fewest card points wins: 🟨 = 1, 🟥 = 3.</p>
      <ol className="divide-y divide-border">
        {rows.slice(0, 3).map((r, i) => (
          <li key={r.teamId} className="flex items-center gap-3 px-4 py-2.5">
            <span className="num w-5 text-center font-bold text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">
              {r.name} {i === 0 && <span aria-label="leader">🕊️</span>}
            </span>
            <span className="num text-sm text-muted">🟨 {r.yellow} · 🟥 {r.red}</span>
            <span className="num w-8 text-right font-black">{r.points}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Records({ records, seasonId }: { records: SeasonRecords; seasonId: number }) {
  const items = [
    { label: "Biggest win", match: records.biggestWin, icon: "💥" },
    { label: "Most goals in a match", match: records.mostGoals, icon: "🎆" },
  ].filter((x) => x.match);
  if (items.length === 0) return <p className="px-4 py-6 text-sm text-muted">Records will appear once matches are played.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map(({ label, match: m, icon }) => (
        <li key={label}>
          <Link href={`/season/${seasonId}/match/${m!.id}`} className="block px-4 py-3 hover:bg-surface-2">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <span aria-hidden>{icon}</span> {label} · {formatDate(m!.date, { year: false, weekday: false })}
            </p>
            <Scoreline match={m!} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------

/** Personal card for a fan's favourite team, or an invitation to pick one / sign up. */
export function YourTeam({ snapshot, signedIn }: { snapshot: TeamSnapshot | null; signedIn: boolean }) {
  if (!snapshot) {
    return (
      <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="font-bold">⭐ {signedIn ? "Pick your favourite team" : "Follow your team"}</p>
          <p className="text-sm text-muted">
            {signedIn
              ? "Choose a team in your account and its next match, position and form will appear right here."
              : "Create a free account to see your team's next match, position and form every time you visit."}
          </p>
        </div>
        <LinkButton href={signedIn ? "/account" : "/signup"} variant="primary" className="shrink-0">
          {signedIn ? "Choose team" : "Sign up free"}
        </LinkButton>
      </Card>
    );
  }

  const { team, season, row, tableName, next, last } = snapshot;
  const result = last
    ? (() => {
        const mine = last.home.id === team.id ? last.homeScore! : last.awayScore!;
        const theirs = last.home.id === team.id ? last.awayScore! : last.homeScore!;
        return mine > theirs ? "W" : mine < theirs ? "L" : "D";
      })()
    : null;
  const opponent = (m: Match) => (m.home.id === team.id ? `vs ${m.away.name} (H)` : `at ${m.home.name} (A)`);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-brand-soft px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">⭐ Your team</p>
          <Link href={`/season/${season.id}/teams/${team.id}`} className="block truncate text-lg font-black hover:underline">
            {team.name}
          </Link>
        </div>
        {row && (
          <div className="text-right">
            <p className="num text-3xl font-black leading-none">{ordinal(row.position)}</p>
            <p className="text-xs text-muted">{tableName ?? "in the league"}</p>
          </div>
        )}
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-3">
        <Stat label="Points">
          <span className="num text-2xl font-black">{row?.points ?? 0}</span>
          <span className="ml-1 text-xs text-muted">from {row?.played ?? 0}</span>
        </Stat>
        <Stat label="Form">{row && row.form.length ? <FormGuide form={row.form} /> : <span className="text-muted">No games yet</span>}</Stat>
        <Stat label="Last result">
          {last ? (
            <Link href={`/season/${season.id}/match/${last.id}`} className="hover:underline">
              <span className={`mr-1 font-black ${result === "W" ? "text-top" : result === "L" ? "text-rel" : "text-muted"}`}>{result}</span>
              <span className="num font-semibold">{last.homeScore}–{last.awayScore}</span>{" "}
              <span className="text-sm text-muted">{opponent(last)}</span>
            </Link>
          ) : (
            <span className="text-muted">–</span>
          )}
        </Stat>
      </div>
      <div className="px-4 py-3 text-sm">
        {next ? (
          <Link href={`/season/${season.id}/match/${next.id}`} className="hover:underline">
            <span className="font-semibold">Next:</span> {opponent(next)} · {formatDate(next.date)}
            {next.kickoff && ` · ${next.kickoff}`}
          </Link>
        ) : (
          <span className="text-muted">No upcoming match scheduled.</span>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------------------------------------------------------------------------

export function Competitions({ seasons }: { seasons: (Season & { played: number; matches: number; teams: number })[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {seasons.map((s) => {
        const pct = s.matches ? Math.round((s.played / s.matches) * 100) : 0;
        return (
          <li key={s.id}>
            <Link href={`/season/${s.id}`} className="block rounded-xl border border-border bg-surface p-4 hover:border-brand">
              <p className="truncate font-bold">{s.name}</p>
              <p className="text-sm text-muted">
                {FORMAT_LABEL[s.format]} · {s.teams} teams
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className="h-full rounded-full bg-top" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">
                {s.matches === 0 ? "Fixtures coming soon" : pct === 100 ? "Season complete 🏆" : `${s.played} of ${s.matches} matches played`}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function About() {
  return (
    <section className="grid gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-3 sm:p-6">
      {[
        { icon: "🕊️", title: "Peace through play", text: "The Peace Cup brings villages, clans and generations onto one pitch. Rivals on the field, neighbours off it." },
        { icon: "🤝", title: "Fair play first", text: "Every card counts in our Fair Play race. The most sporting team is celebrated alongside the champions." },
        { icon: "🌱", title: "For the community", text: "Run by local officials and volunteers, open to every fan. Sign up, follow your team and cheer them on." },
      ].map((x) => (
        <div key={x.title}>
          <p aria-hidden className="text-2xl">{x.icon}</p>
          <p className="mt-1 font-bold">{x.title}</p>
          <p className="mt-1 text-sm text-muted">{x.text}</p>
        </div>
      ))}
    </section>
  );
}
