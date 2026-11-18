import Link from "next/link";

export function SiteHeader({ official }: { official: boolean }) {
  return (
    <header className="bg-brand text-brand-fg">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:py-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-tight sm:text-lg">
          <span aria-hidden className="text-2xl">⚽</span>
          <span className="truncate">
            Abarilela <span className="font-black">Peace Cup</span>
          </span>
        </Link>
        <Link
          href="/official"
          className="flex min-h-9 shrink-0 items-center rounded-full border border-current/30 px-3 text-sm font-medium hover:bg-white/10"
        >
          {official ? "Official" : "Sign in"}
          <span className="hidden sm:inline">&nbsp;{official ? "panel" : "as official"}</span>
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-4 text-center text-xs text-muted">
      Abarilela Peace Cup · League management
    </footer>
  );
}
