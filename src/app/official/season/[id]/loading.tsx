import { LoadingRegion, SectionSkeleton, TableSkeleton } from "@/components/ui";

/** Teams & groups tab. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <SectionSkeleton lines={2} fields />
        <TableSkeleton rows={8} />
      </div>
    </LoadingRegion>
  );
}
