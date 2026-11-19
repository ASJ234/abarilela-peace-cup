import { HeaderSkeleton, LoadingRegion, MatchListSkeleton, TableSkeleton } from "@/components/ui";

/** A team: squad, then its matches. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <HeaderSkeleton />
        <TableSkeleton rows={10} />
        <MatchListSkeleton days={1} />
      </div>
    </LoadingRegion>
  );
}
