import { LoadingRegion, SectionSkeleton } from "@/components/ui";

/** Schedule tab: playing dates and fixture generation. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <SectionSkeleton lines={3} fields />
        <SectionSkeleton lines={4} fields />
      </div>
    </LoadingRegion>
  );
}
