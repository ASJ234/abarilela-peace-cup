"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type TabItem = {
  href: string;
  label: string;
  /** Active only on exactly `href` (default: `href` and anything below it). */
  exact?: boolean;
  /** Extra path prefixes that also mark this tab active. */
  alsoActiveFor?: string[];
};

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/**
 * Tab bar driven by the URL.
 * - `fill`: on phones the tabs share the width equally (use for a few short labels).
 * - Otherwise the bar scrolls sideways when it doesn't fit, with a fade at the edge
 *   as a hint, and the active tab is scrolled into view.
 */
export function Tabs({ items, fill = false }: { items: TabItem[]; fill?: boolean }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });

  const isActive = (t: TabItem) =>
    (t.exact ? pathname === t.href : under(pathname, t.href)) || (t.alsoActiveFor ?? []).some((p) => under(pathname, p));

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
              className={`flex min-h-11 items-center justify-center whitespace-nowrap border-b-2 text-sm font-semibold ${
                fill ? "flex-1 px-1 sm:flex-none sm:px-4" : "px-3 sm:px-4"
              } ${active ? "border-brand text-fg" : "border-transparent text-muted hover:text-fg"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
