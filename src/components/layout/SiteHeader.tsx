import Link from "next/link";
import { initials } from "@/lib/format";
import { ROLE_LABEL, canManageLeague, type User } from "@/lib/users";
import { UserMenu } from "./UserMenu";

export function SiteHeader({ user }: { user: User | null }) {
  return (
    <header className="sticky top-0 z-10 bg-brand text-brand-fg shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:py-3">
        <Link href="/" className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-tight sm:text-lg">
          <span aria-hidden className="text-2xl">⚽</span>
          {/* Wraps onto two lines on narrow phones rather than being cut off. */}
          <span className="text-[15px] leading-tight sm:text-lg">
            <span className="font-black">Tournament</span> Management System
          </span>
        </Link>
        {user ? (
          <UserMenu
            user={{
              name: user.name,
              initials: initials(user.name),
              roleLabel: ROLE_LABEL[user.role],
              isOfficial: canManageLeague(user),
              isAdmin: user.role === "admin",
            }}
          />
        ) : (
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
            {/* For officials and the admin; visitors don't need an account to view the site. */}
            <Link href="/signin" className="flex min-h-10 items-center rounded-full px-3 text-sm font-medium hover:bg-white/10">
              Sign in
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-6 text-center text-xs text-muted">
      <p>Tournament Management System</p>
    </footer>
  );
}
