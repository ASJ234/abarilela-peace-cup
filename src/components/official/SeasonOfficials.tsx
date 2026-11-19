import Link from "next/link";
import { addSeasonOfficialAction, removeSeasonOfficialAction } from "@/app/actions";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { EmptyState, Field, Select } from "@/components/ui";

type Person = { id: number; username: string; name: string };

/**
 * Admin only: the officials who can see and manage this season, with Remove,
 * and a picker to add another official.
 */
export function SeasonOfficials({
  seasonId,
  assigned,
  officials,
}: {
  seasonId: number;
  /** Officials already on this season. */
  assigned: Person[];
  /** Every official account. */
  officials: Person[];
}) {
  const onSeason = new Set(assigned.map((o) => o.id));
  const available = officials.filter((o) => !onSeason.has(o.id));

  return (
    <div className="space-y-4">
      {assigned.length === 0 ? (
        <EmptyState icon="🧑‍⚖️">No officials on this season yet. Only you can manage it.</EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {assigned.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{o.name}</span>
                <span className="block truncate text-sm text-muted">@{o.username}</span>
              </span>
              <ActionButton
                action={removeSeasonOfficialAction}
                fields={{ seasonId, userId: o.id }}
                confirm={{
                  title: `Remove ${o.name} from this season?`,
                  message: "They will no longer see or manage this season. Their account isn't deleted.",
                  confirmLabel: "Remove",
                  tone: "danger",
                }}
                pendingText="Removing…"
              >
                Remove
              </ActionButton>
            </li>
          ))}
        </ul>
      )}

      {officials.length === 0 ? (
        <p className="text-sm text-muted">
          There are no official accounts yet. Create one on{" "}
          <Link href="/official/users" className="font-semibold text-brand hover:underline">Users &amp; roles</Link>, then add them here.
        </p>
      ) : available.length === 0 ? (
        <p className="text-sm text-muted">Every official is already on this season.</p>
      ) : (
        <ActionForm action={addSeasonOfficialAction} fields={{ seasonId }} className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Add an official" className="min-w-0 flex-1">
              <Select name="userId" required defaultValue="">
                <option value="" disabled>Choose an official</option>
                {available.map((o) => (
                  <option key={o.id} value={o.id}>{o.name} (@{o.username})</option>
                ))}
              </Select>
            </Field>
            <SubmitButton pendingText="Adding…">Add to season</SubmitButton>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
