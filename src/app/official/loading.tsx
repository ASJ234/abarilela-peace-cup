import { CardGridSkeleton, HeaderSkeleton, LoadingRegion, SectionSkeleton } from "@/components/ui";

/** Official panel: seasons list and the new-season form. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <HeaderSkeleton />
        <CardGridSkeleton cards={4} />
        <SectionSkeleton lines={3} fields />
      </div>
    </LoadingRegion>
  );
}
