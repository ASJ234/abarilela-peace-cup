import { LoadingRegion, MatchListSkeleton, SectionSkeleton } from "@/components/ui";

/** Matches & results tab. */
export default function Loading() {
  return (
    <LoadingRegion>
      <div className="space-y-6">
        <SectionSkeleton lines={1} fields />
        <MatchListSkeleton days={2} perDay={3} />
      </div>
    </LoadingRegion>
  );
}
