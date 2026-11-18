"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type TabItem = {
  href: string;
  label: string;
  /** Active only on exactly `href` (default: `href` and anything below it). */
  exact?: boolean;
  /** Extra path prefixes that also mark this tab active. */
  alsoActiveFor?: string[];
};

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** Horizontally scrollable tab bar driven by the URL. */
export function Tabs({ items, children }: { items: TabItem[]; children?: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (t: TabItem) =>
    (t.exact ? pathname === t.href : under(pathname, t.href)) || (t.alsoActiveFor ?? []).some((p) => under(pathname, p));

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border">
      <nav className="-mb-px flex max-w-full overflow-x-auto [scrollbar-width:none]">
        {items.map((t) => {
          const active = isActive(t);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-semibold sm:px-4 ${
                active ? "border-brand text-fg" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
