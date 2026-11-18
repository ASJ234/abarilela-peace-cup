"use client";

import { Tabs } from "@/components/ui";
import type { Format } from "@/lib/types";

export function OfficialSeasonNav({ seasonId, format }: { seasonId: number; format: Format }) {
  const base = `/official/season/${seasonId}`;
  return (
    <Tabs
      items={[
        // The season index page also owns the squad pages under /teams.
        { href: base, label: format === "groups" ? "Teams & groups" : "Teams", exact: true, alsoActiveFor: [`${base}/teams`] },
        { href: `${base}/schedule`, label: "Schedule" },
        { href: `${base}/matches`, label: "Matches & results" },
        { href: `${base}/settings`, label: "Settings" },
      ]}
    />
  );
}
