import { LoadingRegion, Skeleton, TableSkeleton, TabsSkeleton } from "@/components/ui";

/** Entering a season: its header and tabs are loading too. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <TabsSkeleton />
      <TableSkeleton />
    </LoadingRegion>
  );
}
