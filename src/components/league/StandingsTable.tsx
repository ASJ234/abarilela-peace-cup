import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
import type { FormResult, Season, StandingRow } from "@/lib/types";

const FORM_STYLE: Record<FormResult, string> = { W: "bg-top", D: "bg-draw", L: "bg-rel" };
const FORM_LABEL: Record<FormResult, string> = { W: "Win", D: "Draw", L: "Loss" };

/**
 * League table. On phones it keeps Pos, Team, P, W, D, L, GD, Pts;
 * goals for/against appear from `sm` and the form guide from `md`.
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
        <Card className="overflow-x-auto">
          <table className="num w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-9 py-3 pl-3 text-left sm:w-12 sm:pl-4" title="Position">#</th>
                <th className="py-3 text-left">Team</th>
                <Th title="Played">P</Th>
                <Th title="Won">W</Th>
                <Th title="Drawn">D</Th>
                <Th title="Lost">L</Th>
                <Th title="Goals for" hideOnPhone>GF</Th>
                <Th title="Goals against" hideOnPhone>GA</Th>
                <Th title="Goal difference">GD</Th>
                <Th title="Points" className="pr-3 sm:pr-4">Pts</Th>
                <th className="hidden py-3 pr-4 text-left md:table-cell">Form</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const nextZone = rows[i + 1]?.zone;
                // Draw a divider where a highlighted zone ends or begins.
                const divider = nextZone !== undefined && nextZone !== r.zone;
                return (
                  <tr
                    key={r.teamId}
                    className={[
                      "border-t border-border",
                      r.zone === "top" ? "bg-top-bg" : r.zone === "relegation" ? "bg-rel-bg" : "",
                      divider ? "border-b-2 border-b-muted/40" : "",
                    ].join(" ")}
                  >
                    <td className="relative py-3 pl-3 font-semibold sm:pl-4">
                      {r.zone && (
                        <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${r.zone === "top" ? "bg-top" : "bg-rel"}`} />
                      )}
                      {r.position}
                    </td>
                    <td className="max-w-[9rem] truncate py-3 pr-2 font-medium sm:max-w-none">
                      {teamHref ? <Link href={teamHref(r.teamId)} className="hover:underline">{r.name}</Link> : r.name}
                    </td>
                    <Td>{r.played}</Td>
                    <Td>{r.won}</Td>
                    <Td>{r.drawn}</Td>
                    <Td>{r.lost}</Td>
                    <Td hideOnPhone>{r.goalsFor}</Td>
                    <Td hideOnPhone>{r.goalsAgainst}</Td>
                    <Td>{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</Td>
                    <td className="py-3 pr-3 text-center text-base font-bold sm:pr-4">{r.points}</td>
                    <td className="hidden py-3 pr-4 md:table-cell">
                      <FormGuide form={r.form} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
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

function Th({ children, title, hideOnPhone, className = "" }: { children: React.ReactNode; title: string; hideOnPhone?: boolean; className?: string }) {
  return (
    <th title={title} className={`w-8 py-3 text-center sm:w-10 ${hideOnPhone ? "hidden sm:table-cell" : ""} ${className}`}>
      <abbr title={title} className="no-underline">{children}</abbr>
    </th>
  );
}

function Td({ children, hideOnPhone }: { children: React.ReactNode; hideOnPhone?: boolean }) {
  return <td className={`py-3 text-center ${hideOnPhone ? "hidden sm:table-cell" : ""}`}>{children}</td>;
}
