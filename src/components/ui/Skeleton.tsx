/**
 * Loading placeholders shown while a page's data is on its way (see the
 * loading.tsx files). Grey shapes in the layout of the page that's coming, so
 * the screen responds at once and doesn't jump when the content arrives.
 * The pulse is switched off for people who ask for reduced motion.
 */

/** Small spinning ring, sized by the text around it. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[1em] w-[1em] shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin ${className}`}
    />
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block rounded-md bg-surface-2 motion-safe:animate-pulse ${className}`} />;
}

/** Announces the loading state to screen readers once, around the placeholders. */
export function LoadingRegion({ label = "Loading…", children }: { label?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

const box = "rounded-xl border border-border bg-surface";

/** A card with a title and a table of `rows` rows. */
export function TableSkeleton({ rows = 8, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className={box}>
      {title && (
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-5 w-40" />
        </div>
      )}
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-4 w-5" />
            <Skeleton className={`h-4 ${i % 3 === 0 ? "w-36" : i % 3 === 1 ? "w-28" : "w-32"}`} />
            <span className="ml-auto flex gap-3">
              <Skeleton className="h-4 w-6" />
              <Skeleton className="hidden h-4 w-6 sm:block" />
              <Skeleton className="hidden h-4 w-6 sm:block" />
              <Skeleton className="h-4 w-8" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Matches grouped by day: a date heading, then home – score – away rows. */
export function MatchListSkeleton({ days = 2, perDay = 3 }: { days?: number; perDay?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: days }, (_, d) => (
        <div key={d} className="space-y-2">
          <Skeleton className="h-4 w-44" />
          <div className={`${box} divide-y divide-border`}>
            {Array.from({ length: perDay }, (_, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-4">
                <Skeleton className="ml-auto h-4 w-24 sm:w-32" />
                <Skeleton className="h-7 w-14" />
                <Skeleton className="h-4 w-24 sm:w-32" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A grid of small cards (teams, seasons). */
export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className={`${box} space-y-2 p-4`}>
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}

/** A section card with a heading and a few lines or form fields. */
export function SectionSkeleton({ lines = 3, fields = false }: { lines?: number; fields?: boolean }) {
  return (
    <div className={`${box} space-y-4 p-4 sm:p-5`}>
      <Skeleton className="h-5 w-48" />
      {Array.from({ length: lines }, (_, i) =>
        fields ? (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <Skeleton key={i} className={`h-4 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
        ),
      )}
    </div>
  );
}

/** A page title (and subtitle), for pages whose header is part of the page itself. */
export function HeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-8 w-64 max-w-full" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

/** A tab bar, for when the tabs themselves are still loading (e.g. entering a season). */
export function TabsSkeleton({ tabs = 5 }: { tabs?: number }) {
  return (
    <div className="mb-6 flex gap-2 border-b border-border pb-3">
      {Array.from({ length: tabs }, (_, i) => (
        <Skeleton key={i} className="h-5 flex-1 sm:w-20 sm:flex-none" />
      ))}
    </div>
  );
}
