import { LoadingRegion, TableSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingRegion>
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => <TableSkeleton key={i} rows={5} />)}
      </div>
    </LoadingRegion>
  );
}
