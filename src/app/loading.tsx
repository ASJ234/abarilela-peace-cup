import { CardGridSkeleton, LoadingRegion, Skeleton, TableSkeleton } from "@/components/ui";

/** Home page (and any page without its own placeholder). */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <Skeleton className="h-44 w-full rounded-2xl sm:h-52" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <TableSkeleton rows={5} />
          <TableSkeleton rows={5} />
        </div>
        <CardGridSkeleton cards={3} />
      </div>
    </LoadingRegion>
  );
}
