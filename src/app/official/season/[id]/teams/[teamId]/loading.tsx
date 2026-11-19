import { HeaderSkeleton, LoadingRegion, SectionSkeleton, TableSkeleton } from "@/components/ui";

/** A team's squad editor. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <HeaderSkeleton />
        <SectionSkeleton lines={1} fields />
        <TableSkeleton rows={10} title={false} />
      </div>
    </LoadingRegion>
  );
}
