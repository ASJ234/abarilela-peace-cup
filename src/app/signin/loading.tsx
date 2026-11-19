import { LoadingRegion, Skeleton } from "@/components/ui";

/** Sign-in and sign-up: the card with its form fields. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="mx-auto grid max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface md:grid-cols-2">
        <Skeleton className="hidden min-h-80 rounded-none md:block" />
        <div className="space-y-4 p-5 sm:p-8">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-full" />
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </LoadingRegion>
  );
}
