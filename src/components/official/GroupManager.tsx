import { addGroupsAction, deleteGroupAction, drawGroupsAction, renameGroupAction } from "@/app/actions";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import type { Group, Team } from "@/lib/types";

/** Create, rename and delete groups, and randomly draw teams into them. */
export function GroupManager({ seasonId, groups, teams }: { seasonId: number; groups: Group[]; teams: Team[] }) {
  const unassigned = groups.length ? teams.filter((t) => t.groupId == null).length : 0;

  return (
    <div className="space-y-4">
      {unassigned > 0 && (
        <Alert tone="error">{unassigned} team{unassigned === 1 ? " is" : "s are"} not in a group yet.</Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <ActionForm action={addGroupsAction} fields={{ seasonId }} className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm font-semibold">Quick create</p>
          <Field label="Number of groups" hint="Named Group A, Group B, …">
            <Input name="count" type="number" inputMode="numeric" min={1} max={26} defaultValue={groups.length ? 1 : 4} className="num" />
          </Field>
          <SubmitButton variant="secondary" className="w-full sm:w-auto">Create groups</SubmitButton>
        </ActionForm>
        <ActionForm action={addGroupsAction} fields={{ seasonId }} className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm font-semibold">Or name them</p>
          <Field label="Group names" hint="One per line, or separated by commas.">
            <Textarea name="names" rows={2} required placeholder="North, South" />
          </Field>
          <SubmitButton variant="secondary" className="w-full sm:w-auto">Add groups</SubmitButton>
        </ActionForm>
      </div>

      {groups.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {groups.map((g) => {
            const size = teams.filter((t) => t.groupId === g.id).length;
            return (
              <li key={g.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                <ActionForm action={renameGroupAction} fields={{ groupId: g.id }} className="flex min-w-0 flex-1 flex-wrap gap-2" inlineMessage hideSuccess>
                  <Input name="name" defaultValue={g.name} required maxLength={40} aria-label="Group name" className="min-w-0 flex-1 basis-32 sm:max-w-56" />
                  <SubmitButton variant="secondary">Rename</SubmitButton>
                </ActionForm>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted">{size} team{size === 1 ? "" : "s"}</span>
                  <DeleteButton
                    action={deleteGroupAction}
                    fields={{ groupId: g.id }}
                    what={g.name}
                    size="md"
                    detail={`Its ${size} team${size === 1 ? "" : "s"} will be left without a group. Groups that already have fixtures can't be deleted.`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {groups.length >= 2 && (
        <ActionForm action={drawGroupsAction} fields={{ seasonId }} className="flex flex-wrap items-center gap-3">
          <SubmitButton
            variant="secondary"
            pendingText="Drawing…"
            confirm={{
              title: "Random draw into groups?",
              message: "Every team is moved into a randomly chosen group, spread evenly. This replaces the current group of every team.",
              confirmLabel: "Draw groups",
              tone: "primary",
            }}
          >
            🎲 Random draw into groups
          </SubmitButton>
          <span className="text-sm text-muted">Or set each team&apos;s group in the team list.</span>
        </ActionForm>
      )}
    </div>
  );
}
