import { SeasonNav } from "@/components/league";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listSeasons } from "@/lib/league";
import { loadSeason } from "./data";

export default async function SeasonLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const season = await loadSeason(params);
  const seasons = listSeasons(getDb()).map(({ id, name }) => ({ id, name }));

  return (
    <>
      <PageHeader title={season.name} />
      <SeasonNav seasons={seasons} currentId={season.id} />
      {children}
    </>
  );
}
