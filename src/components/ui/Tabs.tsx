"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "./Skeleton";

export type TabItem = {
  href: string;
  label: string;
  /** Active only on exactly `href` (default: `href` and anything below it). */
  exact?: boolean;
  /** Extra path prefixes that also mark this tab active. */
  alsoActiveFor?: string[];
};

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** Shows a spinner next to the label while this tab's page is loading. Must be inside the <Link>. */
function TabLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {pending && <Spinner className="text-xs text-brand" />}
    </span>
  );
}

/**
 * Tab bar driven by the URL.
 * - `fill`: on phones the tabs share the width equally (use for a few short labels).
 * - Otherwise the bar scrolls sideways when it doesn't fit, with a fade at the edge
 *   as a hint, and the active tab is scrolled into view.
 * - A clicked tab becomes active straight away, with a spinner until its page has loaded.
 */
export function Tabs({ items, fill = false }: { items: TabItem[]; fill?: boolean }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  // The tab just clicked, shown as active until the URL catches up.
  const [clicked, setClicked] = useState<{ href: string; from: string } | null>(null);
  const optimistic = clicked && clicked.from === pathname ? clicked.href : null;

  const matchesUrl = (t: TabItem) =>
    (t.exact ? pathname === t.href : under(pathname, t.href)) || (t.alsoActiveFor ?? []).some((p) => under(pathname, p));
  const isActive = (t: TabItem) => (optimistic ? t.href === optimistic : matchesUrl(t));

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () =>
      setFade({ left: nav.scrollLeft > 4, right: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4 });
    nav.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
    update();
    nav.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      nav.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [pathname]);

  const mask =
    fade.left && fade.right ? "[mask-image:linear-gradient(to_right,transparent,black_2rem,black_calc(100%-2rem),transparent)]"
    : fade.right ? "[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]"
    : fade.left ? "[mask-image:linear-gradient(to_right,transparent,black_2.5rem)]"
    : "";

  return (
    <div className="mb-6 border-b border-border">
      <nav ref={navRef} className={`-mb-px flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${mask}`}>
        {items.map((t) => {
          const active = isActive(t);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                // Opening in a new tab or window doesn't change this page.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                if (!matchesUrl(t) || t.href !== pathname) setClicked({ href: t.href, from: pathname });
              }}
              className={`flex min-h-11 items-center justify-center whitespace-nowrap border-b-2 text-sm font-semibold ${
                fill ? "flex-1 px-1 sm:flex-none sm:px-4" : "px-3 sm:px-4"
              } ${active ? "border-brand text-fg" : "border-transparent text-muted hover:text-fg"}`}
            >
              <TabLabel label={t.label} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
