import { removeTeamAction, renameTeamAction, setTeamGroupAction } from "@/app/actions";
import { ActionForm, AutoSaveSelect, DeleteButton, SubmitButton } from "@/components/forms";
import { Input, LinkButton } from "@/components/ui";
import type { Group, Team } from "@/lib/types";

/**
 * Editable team list: rename, change group, open squad, remove.
 * Each team is a stacked card on phones and a single row on wider screens.
 */
export function TeamList({
  teams,
  groups,
  squadSize,
  squadHref,
}: {
  teams: Team[];
  groups: Group[];
  squadSize: Map<number, number>;
  squadHref: (teamId: number) => string;
}) {
  const groupOptions = [{ value: "", label: "No group" }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))];

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {teams.map((t) => (
        <li key={t.id} className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <ActionForm action={renameTeamAction} fields={{ teamId: t.id }} className="flex flex-wrap gap-2" inlineMessage hideSuccess>
            <Input name="name" defaultValue={t.name} required maxLength={60} aria-label="Team name" className="min-w-0 flex-1 basis-40" />
            <SubmitButton variant="secondary">Rename</SubmitButton>
          </ActionForm>
          <div className="flex flex-wrap items-start gap-2">
            {groups.length > 0 && (
              <div className="min-w-32 flex-1 md:flex-none">
                <AutoSaveSelect
                  action={setTeamGroupAction}
                  fields={{ teamId: t.id }}
                  name="groupId"
                  label={`Group for ${t.name}`}
                  defaultValue={t.groupId != null ? String(t.groupId) : ""}
                  options={groupOptions}
                />
              </div>
            )}
            <LinkButton href={squadHref(t.id)}>
              👥 {squadSize.get(t.id) ?? 0} players
            </LinkButton>
            <DeleteButton
              action={removeTeamAction}
              fields={{ teamId: t.id }}
              what={t.name}
              verb="Remove"
              size="md"
              detail={`${t.name} and its whole squad will be removed from this season. Teams that already have fixtures can't be removed.`}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
