import { LoadingRegion, SectionSkeleton, Skeleton } from "@/components/ui";

/** A match: the scoreline card, then the timeline. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <div className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6">
          <Skeleton className="mx-auto h-4 w-48" />
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
            <Skeleton className="ml-auto h-6 w-28 sm:w-40" />
            <Skeleton className="h-12 w-24" />
            <Skeleton className="h-6 w-28 sm:w-40" />
          </div>
        </div>
        <SectionSkeleton lines={4} />
      </div>
    </LoadingRegion>
  );
}
