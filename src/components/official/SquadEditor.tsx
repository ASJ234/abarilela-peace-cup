import { addPlayersAction, deletePlayerAction, updatePlayerAction } from "@/app/actions";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui";
import type { SquadRow } from "@/lib/players";
import { POSITIONS, POSITION_LABEL } from "@/lib/types";

export function AddPlayersForm({ teamId }: { teamId: number }) {
  return (
    <ActionForm action={addPlayersAction} fields={{ teamId }}>
      <Field label="Add players, one per line" hint="Format: shirt number, name, position. Number and position are optional. Positions: GK, DF, MF, FW.">
        <Textarea
          name="players"
          rows={5}
          required
          placeholder={"1 Sam Ouma GK\n4 David Kato DF\n10 Peter Mugisha MF\n9 John Okello FW\nAli Hassan"}
          className="font-mono"
        />
      </Field>
      <SubmitButton pendingText="Adding…" className="w-full sm:w-auto">Add players</SubmitButton>
    </ActionForm>
  );
}

/** Editable squad list: two compact lines per player on phones, one row on wider screens. */
export function SquadEditor({ squad }: { squad: SquadRow[] }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      <li className="hidden grid-cols-[4.5rem_minmax(0,1fr)_10rem_auto] gap-2 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted sm:grid">
        <span>No.</span><span>Name</span><span>Position</span><span className="w-16" />
      </li>
      {squad.map((p) => (
        <li key={p.id} className="p-3 sm:px-4">
          <ActionForm
            action={updatePlayerAction}
            fields={{ playerId: p.id }}
            className="grid grid-cols-[4rem_minmax(0,1fr)_auto] gap-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_10rem_auto]"
            inlineMessage
            hideSuccess
          >
            <Input name="number" type="number" inputMode="numeric" min={0} max={99} defaultValue={p.number ?? ""} aria-label="Shirt number" placeholder="No." className="num" />
            <Input name="name" defaultValue={p.name} required maxLength={60} aria-label="Player name" className="col-span-2 sm:col-span-1" />
            <Select name="position" defaultValue={p.position ?? ""} aria-label="Position" className="col-span-2 sm:col-span-1">
              <option value="">No position</option>
              {POSITIONS.map((pos) => <option key={pos} value={pos}>{POSITION_LABEL[pos]}</option>)}
            </Select>
            <SubmitButton variant="secondary">Save</SubmitButton>
          </ActionForm>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="num text-sm text-muted" title="Goals · assists · yellow · red">
              ⚽ {p.goals} · 🎯 {p.assists} · 🟨 {p.yellow} · 🟥 {p.red}
            </span>
            <DeleteButton
              action={deletePlayerAction}
              fields={{ playerId: p.id }}
              what={p.name}
              verb="Remove"
              detail="The player is removed from the squad. Players with goals, assists or cards recorded can't be removed."
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
