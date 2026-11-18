import { OfficialSeasonNav } from "@/components/official";
import { LinkButton, PageHeader } from "@/components/ui";
import { loadSeasonForOfficial } from "./data";

export default async function OfficialSeasonLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const season = await loadSeasonForOfficial(params);
  return (
    <div>
      <PageHeader
        title={season.name}
        subtitle={season.format === "groups" ? "Group stage" : "League · home and away"}
        back={{ href: "/official", label: "Official panel" }}
        actions={<LinkButton href={`/season/${season.id}`}>View public site</LinkButton>}
      />
      <OfficialSeasonNav seasonId={season.id} format={season.format} />
      {children}
    </div>
  );
}
