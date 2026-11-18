import { setPinnedSeasonAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge } from "@/components/ui";
import type { FeaturedReason } from "@/lib/insights";

const WHY: Record<Exclude<FeaturedReason, "pinned">, string> = {
  "next-match": "it has the soonest upcoming match",
  "latest-result": "it has the most recent result",
  newest: "it's the newest season",
};

/**
 * Shows whether this season is on the home page and why, and lets the admin
 * pin it (or unpin to go back to automatic).
 */
export function HomePagePin({
  seasonId,
  seasonName,
  featured,
  canPin,
}: {
  seasonId: number;
  seasonName: string;
  /** The season currently on the home page, and why. */
  featured: { id: number; name: string; reason: FeaturedReason } | null;
  /** Only the admin can pin. */
  canPin: boolean;
}) {
  const isFeatured = featured?.id === seasonId;
  const pinnedHere = isFeatured && featured?.reason === "pinned";
  const otherPinned = !isFeatured && featured?.reason === "pinned";

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        {isFeatured ? (
          <>
            <Badge tone="success">🏠 On the home page</Badge>
            <span className="text-muted">
              {pinnedHere ? "Pinned by the admin." : `Chosen automatically because ${WHY[featured!.reason as Exclude<FeaturedReason, "pinned">]}.`}
            </span>
          </>
        ) : (
          <>
            <Badge>Not on the home page</Badge>
            {featured && (
              <span className="text-muted">
                The home page shows <strong>{featured.name}</strong>{" "}
                {featured.reason === "pinned" ? "(pinned)." : `(automatic: ${WHY[featured.reason as Exclude<FeaturedReason, "pinned">]}).`}
              </span>
            )}
          </>
        )}
      </p>

      {canPin ? (
        <ActionForm action={setPinnedSeasonAction} fields={{ seasonId, pin: pinnedHere ? 0 : 1 }} className="space-y-2">
          <SubmitButton
            variant={pinnedHere ? "secondary" : "primary"}
            className="w-full sm:w-auto"
            confirm={
              otherPinned
                ? {
                    title: `Pin "${seasonName}" instead?`,
                    message: `"${featured!.name}" is pinned now. Only one season can be pinned, so it will be unpinned.`,
                    confirmLabel: "Pin this season",
                    tone: "primary",
                  }
                : undefined
            }
          >
            {pinnedHere ? "Unpin (choose automatically)" : "📌 Pin to the home page"}
          </SubmitButton>
          <p className="text-xs text-muted">
            {pinnedHere
              ? "Unpinning lets the home page pick the season with the next match again."
              : "Pinning keeps this season on the home page even when another one has matches sooner."}
          </p>
        </ActionForm>
      ) : (
        <Alert tone="info">Only the admin can pin a season to the home page.</Alert>
      )}
    </div>
  );
}
