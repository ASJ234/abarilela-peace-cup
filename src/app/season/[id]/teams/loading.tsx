import { CardGridSkeleton, LoadingRegion } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingRegion>
      <CardGridSkeleton cards={9} />
    </LoadingRegion>
  );
}
