import { LoadingRegion, SectionSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <SectionSkeleton lines={4} fields />
        <SectionSkeleton lines={1} />
      </div>
    </LoadingRegion>
  );
}
