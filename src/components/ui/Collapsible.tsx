"use client";

import { useState } from "react";

/**
 * A titled panel the user can open and close. `defaultOpen` only sets the
 * starting state, so the panel doesn't snap shut (hiding a success message)
 * when the data behind the page changes after a save.
 */
export function Collapsible({
  title,
  defaultOpen = false,
  children,
  className = "",
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={`group rounded-xl border border-border bg-surface p-4 sm:p-6 ${className}`}
    >
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-lg font-semibold [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-muted transition group-open:rotate-90">▸</span> {title}
      </summary>
      {children}
    </details>
  );
}
