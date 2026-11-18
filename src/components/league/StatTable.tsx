import Link from "next/link";
import { Card } from "@/components/ui";

export type StatRow = { key: number; name: string; teamName: string; teamHref?: string; values: (number | string)[] };

/** Ranked player list (top scorers, assists, cards). Equal values share a rank. */
export function StatTable({
  title,
  columns,
  rows,
  emptyText,
}: {
  title: string;
  columns: string[];
  rows: StatRow[];
  emptyText: string;
}) {
  return (
    <Card className="overflow-hidden">
      <h2 className="border-b border-border px-4 py-3 font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">{emptyText}</p>
      ) : (
        <table className="num w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-10 py-2 pl-4 text-left">#</th>
              <th className="py-2 text-left">Player</th>
              {columns.map((c) => <th key={c} className="w-12 py-2 pr-3 text-center sm:w-14 sm:pr-4">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const rank = i > 0 && r.values.join() === rows[i - 1].values.join() ? null : i + 1;
              return (
                <tr key={r.key} className="border-t border-border">
                  <td className="py-2 pl-4 text-muted">{rank ?? ""}</td>
                  <td className="max-w-0 py-2 pr-2">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {r.teamHref ? <Link href={r.teamHref} className="hover:underline">{r.teamName}</Link> : r.teamName}
                    </span>
                  </td>
                  {r.values.map((v, j) => <td key={j} className="py-2 pr-3 text-center text-base font-bold sm:pr-4">{v}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
