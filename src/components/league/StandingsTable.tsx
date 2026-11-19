import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
import type { FormResult, Season, StandingRow } from "@/lib/types";

const FORM_STYLE: Record<FormResult, string> = { W: "bg-top", D: "bg-draw", L: "bg-rel" };
const FORM_LABEL: Record<FormResult, string> = { W: "Win", D: "Draw", L: "Loss" };

/**
 * League table. Every column, form guide included, is always shown. On phones (below `md`)
 * the table scrolls sideways while the position and team stay pinned on the left; from `md`
 * up it fits the width, with no scrolling or pinning.
 */
export function StandingsTable({
  rows,
  title,
  teamHref,
}: {
  rows: StandingRow[];
  title?: string;
  teamHref?: (teamId: number) => string;
}) {
  return (
    <section className="min-w-0">
      {title && <h2 className="mb-2 text-lg font-bold">{title}</h2>}
      {rows.length === 0 ? (
        <EmptyState>No teams yet.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto overscroll-x-contain md:overflow-x-visible" tabIndex={0} role="region" aria-label={`${title ?? "League"} table (scrolls sideways)`}>
            <table className="num w-full min-w-[42rem] text-sm md:min-w-0">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="sticky left-0 z-10 w-10 bg-surface-2 md:static py-3 pl-3 text-left sm:w-12 sm:pl-4" title="Position">#</th>
                  <th className="sticky left-10 z-10 bg-surface-2 py-3 pr-3 text-left shadow-[inset_-1px_0_0_var(--border)] sm:left-12 md:static md:shadow-none">Team</th>
                  <Th title="Played">P</Th>
                  <Th title="Won">W</Th>
                  <Th title="Drawn">D</Th>
                  <Th title="Lost">L</Th>
                  <Th title="Goals for">GF</Th>
                  <Th title="Goals against">GA</Th>
                  <Th title="Goal difference">GD</Th>
                  <Th title="Points">Pts</Th>
                  <th className="py-3 pl-2 pr-4 text-left" title="Last five results, oldest first">Form</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const nextZone = rows[i + 1]?.zone;
                  // Draw a divider where a highlighted zone ends or begins.
                  const divider = nextZone !== undefined && nextZone !== r.zone;
                  // Pinned cells need the row's own (opaque) background so scrolled cells don't show through.
                  const bg = r.zone === "top" ? "bg-top-bg" : r.zone === "relegation" ? "bg-rel-bg" : "bg-surface";
                  return (
                    <tr
                      key={r.teamId}
                      className={["border-t border-border", bg, divider ? "border-b-2 border-b-muted/40" : ""].join(" ")}
                    >
                      <td className={`sticky left-0 z-[1] py-3 pl-3 font-semibold sm:pl-4 md:relative ${bg}`}>
                        {r.zone && (
                          <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${r.zone === "top" ? "bg-top" : "bg-rel"}`} />
                        )}
                        {r.position}
                      </td>
                      <td className={`sticky left-10 z-[1] max-w-[11rem] py-3 pr-3 font-medium shadow-[inset_-1px_0_0_var(--border)] sm:left-12 sm:max-w-none md:static md:shadow-none ${bg}`}>
                        <span className="block truncate">
                          {teamHref ? <Link href={teamHref(r.teamId)} className="hover:underline">{r.name}</Link> : r.name}
                        </span>
                      </td>
                      <Td>{r.played}</Td>
                      <Td>{r.won}</Td>
                      <Td>{r.drawn}</Td>
                      <Td>{r.lost}</Td>
                      <Td>{r.goalsFor}</Td>
                      <Td>{r.goalsAgainst}</Td>
                      <Td>{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</Td>
                      <td className="py-3 text-center text-base font-bold">{r.points}</td>
                      <td className="py-3 pl-2 pr-4">
                        <FormGuide form={r.form} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="mt-1.5 text-xs text-muted md:hidden" aria-hidden>
        Swipe the table sideways to see goals and form →
      </p>
    </section>
  );
}

export function FormGuide({ form }: { form: FormResult[] }) {
  if (form.length === 0) return <span className="text-muted">–</span>;
  return (
    <div className="flex gap-1">
      {form.map((f, j) => (
        <span key={j} title={FORM_LABEL[f]} className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white ${FORM_STYLE[f]}`}>
          {f}
        </span>
      ))}
    </div>
  );
}

export function TableLegend({ season, grouped }: { season: Season; grouped: boolean }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
      {season.highlightTop > 0 && (
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-top" /> Top {season.highlightTop}
          {grouped ? " in each group" : ""}
        </li>
      )}
      {season.relegation > 0 && (
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-rel" /> Bottom {season.relegation}
          {grouped ? " in each group" : " (relegation)"}
        </li>
      )}
      <li>
        Win {season.points.win} pts · Draw {season.points.draw} · Loss {season.points.loss}. Ties are split by goal
        difference, then goals scored.
      </li>
    </ul>
  );
}

function Th({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <th title={title} className="w-10 py-3 text-center">
      <abbr title={title} className="no-underline">{children}</abbr>
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-3 text-center">{children}</td>;
}
