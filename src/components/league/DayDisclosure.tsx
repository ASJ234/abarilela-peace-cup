"use client";

import { useState } from "react";

/** A foldable day group. `defaultOpen` sets only the starting state, so saving a score doesn't fold it away. */
export function DayDisclosure({ defaultOpen, summary, children }: { defaultOpen: boolean; summary: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group">
      <summary className="mb-2 flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 text-sm [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      {children}
    </details>
  );
}
