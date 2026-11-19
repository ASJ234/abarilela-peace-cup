import { LoadingRegion, TableSkeleton } from "@/components/ui";

/** Table tab. */
export default function Loading() {
  return (
    <LoadingRegion>
      <TableSkeleton />
    </LoadingRegion>
  );
}
