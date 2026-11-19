import { HeaderSkeleton, LoadingRegion, SectionSkeleton, TableSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <HeaderSkeleton />
        <SectionSkeleton lines={2} fields />
        <TableSkeleton rows={6} />
      </div>
    </LoadingRegion>
  );
}
