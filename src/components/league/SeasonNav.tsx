"use client";

import { usePathname, useRouter } from "next/navigation";
import { Select, Tabs } from "@/components/ui";

/** Public season tabs plus a season switcher that keeps the current tab. */
export function SeasonNav({ seasons, currentId }: { seasons: { id: number; name: string }[]; currentId: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/season/${currentId}`;
  const items = [
    { href: base, label: "Table", exact: true },
    { href: `${base}/fixtures`, label: "Fixtures" },
    { href: `${base}/results`, label: "Results" },
    { href: `${base}/stats`, label: "Stats" },
    { href: `${base}/teams`, label: "Teams" },
  ];
  const current = items.find((t) => !t.exact && pathname.startsWith(t.href));
  const suffix = current ? current.href.slice(base.length) : "";

  return (
    <Tabs items={items}>
      {seasons.length > 1 && (
        <label className="mb-2 flex w-full items-center gap-2 text-sm text-muted sm:w-auto">
          Season
          <Select value={currentId} onChange={(e) => router.push(`/season/${e.target.value}${suffix}`)} className="sm:w-auto">
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </label>
      )}
    </Tabs>
  );
}
