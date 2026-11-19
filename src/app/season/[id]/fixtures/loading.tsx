import { LoadingRegion, MatchListSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingRegion>
      <MatchListSkeleton />
    </LoadingRegion>
  );
}
