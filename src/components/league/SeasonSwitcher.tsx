"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button, Modal } from "@/components/ui";
import { FORMAT_LABEL, type Format } from "@/lib/types";

export type SeasonChoice = { id: number; name: string; format: Format; teams: number; played: number; matches: number };

/**
 * "Switch season" button that opens a list of seasons as large, tappable rows
 * (works well on phones, and long names wrap instead of being cut off).
 * Switching keeps you on the same tab, e.g. Fixtures → the other season's Fixtures.
 */
export function SeasonSwitcher({ seasons, currentId }: { seasons: SeasonChoice[]; currentId: number }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  if (seasons.length < 2) return null;

  // Keep the list tabs (/fixtures, /results, /stats, /teams); detail pages fall back to that tab.
  const rest = pathname.replace(/^\/season\/\d+/, "");
  const tab = ["/fixtures", "/results", "/stats", "/teams"].find((t) => rest.startsWith(t)) ?? "";

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog" className="gap-2">
        <span aria-hidden>⇄</span> Switch season
        <span className="rounded-full bg-surface-2 px-2 text-xs text-muted">{seasons.length}</span>
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Choose a season" description="You'll stay on the same tab.">
        <ul className="-mx-1 space-y-2">
          {seasons.map((s) => {
            const current = s.id === currentId;
            const pct = s.matches ? Math.round((s.played / s.matches) * 100) : 0;
            return (
              <li key={s.id}>
                <Link
                  href={`/season/${s.id}${tab}`}
                  onClick={() => setOpen(false)}
                  aria-current={current ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                    current ? "border-brand bg-brand-soft" : "border-border hover:border-brand hover:bg-surface-2"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug">{s.name}</span>
                    <span className="block text-xs text-muted">
                      {FORMAT_LABEL[s.format]} · {s.teams} teams ·{" "}
                      {s.matches === 0 ? "no fixtures yet" : pct === 100 ? "complete" : `${s.played}/${s.matches} played`}
                    </span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                      <span className="block h-full rounded-full bg-top" style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                  <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm ${current ? "bg-brand text-brand-fg" : "text-muted"}`}>
                    {current ? "✓" : "›"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}
