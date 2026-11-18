import { redirect } from "next/navigation";
import { EmptyState, LinkButton } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listSeasons } from "@/lib/league";

export default function Home() {
  const [latest] = listSeasons(getDb());
  if (latest) redirect(`/season/${latest.id}`);

  return (
    <div className="mx-auto max-w-lg">
      <EmptyState icon="🏆" title="No season yet">
        <p>Once an official creates a season, adds teams and generates fixtures, the league table will appear here.</p>
        <LinkButton href="/official" variant="primary" className="mt-4">Official sign in</LinkButton>
      </EmptyState>
    </div>
  );
}
