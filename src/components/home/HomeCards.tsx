import {
  CalendarDays, ChevronRight, Clock, HeartHandshake, MapPin, ShieldCheck, Shirt, Star, TrendingUp, Trophy, Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { FormGuide, Scoreline } from "@/components/league";
import { Badge, Card, LinkButton } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { FairPlayRow, SeasonNumbers, SeasonRecords, TeamSnapshot } from "@/lib/insights";
import { FORMAT_LABEL, type GroupTable, type Match, type PlayerStat, type Season } from "@/lib/types";
import { BallIcon, CardChip } from "./icons";

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** Card with an icon, a heading and an optional "see all" link. */
export function HomeCard({
  title,
  icon,
  href,
  linkLabel = "See all",
  children,
  className = "",
}: {
  title: string;
  icon?: React.ReactNode;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex min-w-0 items-center gap-2 font-bold">
          {icon && (
            <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
              {icon}
            </span>
          )}
          <span className="truncate">{title}</span>
        </h2>
        {href && (
          <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand hover:underline">
            {linkLabel}
            <ChevronRight size={16} aria-hidden />
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  );
}

/** Icon at the size used in card headings. */
export const cardIcon = (Icon: LucideIcon) => <Icon size={16} strokeWidth={2.25} />;

// ---------------------------------------------------------------------------

/** The season at a glance: a row of numbers. */
export function StatStrip({ n }: { n: SeasonNumbers }) {
  const tiles: { label: string; value: string | number; icon: React.ReactNode }[] = [
    { icon: <Users size={18} />, label: "Teams", value: n.teams },
    { icon: <Shirt size={18} />, label: "Players", value: n.players },
    { icon: <CalendarDays size={18} />, label: "Played", value: `${n.played}/${n.matches}` },
    { icon: <BallIcon size={18} />, label: "Goals", value: n.goals },
    { icon: <TrendingUp size={18} />, label: "Goals / match", value: n.goalsPerMatch },
    {
      icon: <span className="flex gap-0.5"><CardChip color="yellow" /><CardChip color="red" /></span>,
      label: "Cards",
      value: n.yellow + n.red,
    },
  ];
  return (
    <ul className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <li key={t.label} className="flex flex-col items-center rounded-xl border border-border bg-surface px-2 py-3 text-center">
          <span aria-hidden className="grid h-6 place-items-center text-muted">{t.icon}</span>
          <p className="num mt-1 text-xl font-black sm:text-2xl">{t.value}</p>
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

/**
 * The fixtures after the one in the hero spotlight. A sideways-scrolling row on
 * phones, a grid of up to four from `sm` up.
 */
export function UpcomingStrip({ matches, seasonId, href }: { matches: Match[]; seasonId: number; href: string }) {
  if (matches.length === 0) return null;
  return (
    <section aria-labelledby="also-coming-up">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="also-coming-up" className="flex items-center gap-2 font-bold">
          <CalendarDays size={18} className="text-brand" aria-hidden /> Also coming up
        </h2>
        <Link href={href} className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand hover:underline">
          All fixtures <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {matches.map((m) => (
          <li key={m.id} className="w-[15rem] shrink-0 snap-start sm:w-auto">
            <Link
              href={`/season/${seasonId}/match/${m.id}`}
              className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-3 hover:border-brand"
            >
              <p className="flex items-center justify-between gap-2 text-xs text-muted">
                <span className="truncate">{formatDate(m.date, { year: false })}</span>
                {(m.stage || m.groupName) && <Badge tone={m.stage ? "brand" : "neutral"}>{m.stage ?? m.groupName}</Badge>}
              </p>
              <p className="font-semibold leading-snug">
                <span className="block truncate">{m.home.name}</span>
                <span className="text-xs font-normal text-muted">v </span>
                <span className="truncate">{m.away.name}</span>
              </p>
              <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                {m.kickoff && <span className="inline-flex items-center gap-1"><Clock size={13} aria-hidden />{m.kickoff}</span>}
                {m.venue && <span className="inline-flex min-w-0 items-center gap-1"><MapPin size={13} aria-hidden /><span className="truncate">{m.venue}</span></span>}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
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
            {!grouped && (
              <thead className="text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="w-9 py-1.5 pl-4 text-left font-medium">#</th>
                  <th className="py-1.5 text-left font-medium">Team</th>
                  <th className="w-10 py-1.5 text-center font-medium" title="Played">P</th>
                  <th className="hidden w-10 py-1.5 text-center font-medium sm:table-cell" title="Goal difference">GD</th>
                  <th className="w-12 py-1.5 pr-4 text-center font-medium" title="Points">Pts</th>
                </tr>
              </thead>
            )}
            <tbody>
              {t.rows.slice(0, grouped ? 2 : rows).map((r) => (
                <tr key={r.teamId} className={`border-t border-border ${grouped ? "first:border-t-0" : ""} ${r.zone === "top" ? "bg-top-bg" : ""}`}>
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

const MEDAL = ["bg-[#d4a017]", "bg-[#94a3b8]", "bg-[#b87333]"];

/** Top three for a stat, e.g. the Golden Boot race, with gold, silver and bronze badges. */
export function Podium({
  stats,
  unit,
  seasonId,
  empty,
}: {
  stats: PlayerStat[];
  /** Singular and plural, e.g. ["goal", "goals"]. */
  unit: [string, string];
  seasonId: number;
  empty: string;
}) {
  if (stats.length === 0) return <p className="px-4 py-6 text-sm text-muted">{empty}</p>;
  return (
    <ol className="divide-y divide-border">
      {stats.slice(0, 3).map((s, i) => (
        <li key={s.playerId} className="flex items-center gap-3 px-4 py-2.5">
          <span
            aria-label={`Position ${i + 1}`}
            className={`num grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black text-white ${MEDAL[i]}`}
          >
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{s.name}</span>
            <Link href={`/season/${seasonId}/teams/${s.teamId}`} className="block truncate text-xs text-muted hover:underline">
              {s.teamName}
            </Link>
          </span>
          <span className="num text-right">
            <span className="text-xl font-black">{s.count}</span>
            <span className="ml-1 text-xs text-muted">{plural(s.count, unit[0], unit[1])}</span>
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
      <p className="flex flex-wrap items-center gap-x-1.5 px-4 pt-3 text-xs text-muted">
        Fewest card points wins: <CardChip color="yellow" /> 1 point, <CardChip color="red" /> 3 points.
      </p>
      <ol className="divide-y divide-border">
        {rows.slice(0, 3).map((r, i) => (
          <li key={r.teamId} className="flex items-center gap-3 px-4 py-2.5">
            <span className="num w-5 text-center font-bold text-muted">{i + 1}</span>
            <span className="flex min-w-0 flex-1 items-center gap-1.5 font-semibold">
              <span className="truncate">{r.name}</span>
              {i === 0 && <ShieldCheck size={16} className="shrink-0 text-top" aria-label="Leader" />}
            </span>
            <span className="num flex items-center gap-1.5 text-sm text-muted" aria-label={`${r.yellow} yellow, ${r.red} red`}>
              <CardChip color="yellow" />{r.yellow}
              <CardChip color="red" className="ml-1" />{r.red}
            </span>
            <span className="num w-8 text-right font-black" title="Card points">{r.points}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Biggest win and most goals in a match; shown once when the same match holds both. */
export function Records({ records, seasonId }: { records: SeasonRecords; seasonId: number }) {
  const { biggestWin, mostGoals } = records;
  const items = biggestWin && mostGoals && biggestWin.id === mostGoals.id
    ? [{ label: "Biggest win & most goals", match: biggestWin }]
    : [
        { label: "Biggest win", match: biggestWin },
        { label: "Most goals in a match", match: mostGoals },
      ].filter((x): x is { label: string; match: Match } => x.match != null);
  if (items.length === 0) return <p className="px-4 py-6 text-sm text-muted">Records will appear once matches are played.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map(({ label, match: m }) => (
        <li key={label}>
          <Link href={`/season/${seasonId}/match/${m.id}`} className="block px-4 py-3 hover:bg-surface-2">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              {label} · {formatDate(m.date, { year: false, weekday: false })}
            </p>
            <Scoreline match={m} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------

/** Personal card for a signed-in user's favourite team, or an invitation to pick one. */
export function YourTeam({ snapshot }: { snapshot: TeamSnapshot | null }) {
  if (!snapshot) {
    return (
      <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
            <Star size={18} />
          </span>
          <div>
            <p className="font-bold">Pick your favourite team</p>
            <p className="text-sm text-muted">
              Choose a team in your account and its next match, position and form will appear right here.
            </p>
          </div>
        </div>
        <LinkButton href="/account" variant="primary" className="shrink-0">
          Choose team
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
          <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <Star size={13} className="fill-current text-[#d4a017]" aria-hidden /> Your team
          </p>
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

/** Every season, with progress; the one featured on this page is marked. */
export function Competitions({
  seasons,
  featuredId,
}: {
  seasons: (Season & { played: number; matches: number; teams: number })[];
  featuredId?: number;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {seasons.map((s) => {
        const pct = s.matches ? Math.round((s.played / s.matches) * 100) : 0;
        const done = s.matches > 0 && pct === 100;
        return (
          <li key={s.id}>
            <Link
              href={`/season/${s.id}`}
              className={`block h-full rounded-xl border bg-surface p-4 hover:border-brand ${s.id === featuredId ? "border-brand" : "border-border"}`}
            >
              <p className="flex items-center justify-between gap-2">
                <span className="truncate font-bold">{s.name}</span>
                {s.id === featuredId ? <Badge tone="brand">Featured</Badge> : done ? <Badge tone="success">Complete</Badge> : null}
              </p>
              <p className="text-sm text-muted">
                {FORMAT_LABEL[s.format]} · {s.teams} {plural(s.teams, "team")}
              </p>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${s.name} progress`}
              >
                <div className="h-full rounded-full bg-top" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                {done && <Trophy size={12} aria-hidden />}
                {s.matches === 0 ? "Fixtures coming soon" : done ? "Season complete" : `${s.played} of ${s.matches} matches played`}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function About() {
  const items: { icon: LucideIcon; title: string; text: string }[] = [
    { icon: HeartHandshake, title: "Peace through play", text: "The tournament brings villages, clans and generations onto one pitch. Rivals on the field, neighbours off it." },
    { icon: ShieldCheck, title: "Fair play first", text: "Every card counts in our Fair Play race. The most sporting team is celebrated alongside the champions." },
    { icon: Users, title: "For the community", text: "Run by local officials and volunteers, open to every fan. Follow the tables, fixtures and results, and cheer your team on." },
  ];
  return (
    <section aria-label="About the tournament" className="grid gap-5 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-3 sm:p-6">
      {items.map(({ icon: Icon, title, text }) => (
        <div key={title} className="flex gap-3 sm:block">
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Icon size={20} />
          </span>
          <div>
            <p className="font-bold sm:mt-3">{title}</p>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
