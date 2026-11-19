import { HeaderSkeleton, LoadingRegion, SectionSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingRegion>
      <div className="mx-auto max-w-2xl space-y-6">
        <HeaderSkeleton />
        <SectionSkeleton lines={2} fields />
        <SectionSkeleton lines={3} fields />
      </div>
    </LoadingRegion>
  );
}
