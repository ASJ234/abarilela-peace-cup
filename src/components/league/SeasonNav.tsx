"use client";

import { Tabs } from "@/components/ui";

/** Public season tabs. On phones the five tabs share the width so they all fit. */
export function SeasonNav({ currentId }: { currentId: number }) {
  const base = `/season/${currentId}`;
  return (
    <Tabs
      fill
      items={[
        { href: base, label: "Table", exact: true },
        { href: `${base}/fixtures`, label: "Fixtures" },
        { href: `${base}/results`, label: "Results" },
        { href: `${base}/stats`, label: "Stats" },
        { href: `${base}/teams`, label: "Teams" },
      ]}
    />
  );
}
