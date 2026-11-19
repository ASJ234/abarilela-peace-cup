import { HeaderSkeleton, LoadingRegion, SectionSkeleton } from "@/components/ui";

/** One match: score, goals & cards, details. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <HeaderSkeleton />
        <SectionSkeleton lines={1} fields />
        <SectionSkeleton lines={4} />
        <SectionSkeleton lines={3} fields />
      </div>
    </LoadingRegion>
  );
}
