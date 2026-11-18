"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/actions";

type MenuUser = { name: string; initials: string; roleLabel: string; isOfficial: boolean; isAdmin: boolean };

/** Avatar button with a small account menu; closes on navigation, outside click or Esc. */
export function UserMenu({ user }: { user: MenuUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close whenever the page changes (adjusting state during render, per React docs).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex min-h-11 items-center gap-3 px-4 text-sm text-fg hover:bg-surface-2";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${user.name}`}
        className="flex min-h-10 items-center gap-2 rounded-full border border-current/30 py-1 pl-1 pr-3 text-sm font-medium hover:bg-white/10"
      >
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-white text-xs font-bold text-[var(--brand)]">
          {user.initials}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{user.name}</span>
        <span aria-hidden className="text-xs">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1 text-fg shadow-xl">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="text-xs text-muted">{user.roleLabel}</p>
          </div>
          <Link role="menuitem" href="/" className={item}>🏠 Home</Link>
          <Link role="menuitem" href="/account" className={item}>👤 Your account</Link>
          {user.isOfficial && <Link role="menuitem" href="/official" className={item}>🛠️ Official panel</Link>}
          {user.isAdmin && <Link role="menuitem" href="/official/users" className={item}>👥 Users &amp; roles</Link>}
          <form action={signOutAction} className="border-t border-border">
            <button role="menuitem" className={`${item} w-full text-left text-rel`}>↩ Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
