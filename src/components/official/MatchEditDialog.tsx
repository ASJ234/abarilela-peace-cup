"use client";

import { createContext, useContext, useState } from "react";
import { setRefereeAction, updateMatchAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Button, Field, Input, Modal, type ButtonSize } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { PLAYED_MATCH_LOCKED, type Format, type Group, type Match, type Team } from "@/lib/types";
import { MatchFields } from "./MatchFields";

type Ctx = { open: (m: Match) => void };
const MatchEditContext = createContext<Ctx | null>(null);

/**
 * Hosts one shared "Edit match" dialog for a list of matches, so the team and
 * group options are sent to the browser once rather than once per match.
 * Put <EditMatchButton> anywhere inside it.
 */
export function MatchEditProvider({
  teams,
  groups,
  format,
  children,
}: {
  teams: Team[];
  groups: Group[];
  format: Format;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState<Match | null>(null);
  const close = () => setEditing(null);

  return (
    <MatchEditContext.Provider value={{ open: setEditing }}>
      {children}
      <Modal
        open={editing != null}
        onClose={close}
        size="lg"
        title="Edit match"
        description={editing ? `${editing.home.name} v ${editing.away.name} · ${formatDate(editing.date)}` : undefined}
      >
        {editing?.played ? (
          <div className="space-y-4">
            <Alert>🔒 {PLAYED_MATCH_LOCKED}</Alert>
            <ActionForm key={editing.id} action={setRefereeAction} fields={{ matchId: editing.id }} onSuccess={close} className="space-y-4">
              <Field label="Referee">
                <Input name="referee" maxLength={60} defaultValue={editing.referee ?? ""} placeholder="Referee's name" autoComplete="off" />
              </Field>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={close} className="w-full sm:w-auto">Close</Button>
                <SubmitButton className="w-full sm:w-auto">Save referee</SubmitButton>
              </div>
            </ActionForm>
          </div>
        ) : editing && (
          <ActionForm key={editing.id} action={updateMatchAction} fields={{ matchId: editing.id }} onSuccess={close} className="space-y-4">
            <MatchFields teams={teams} groups={groups} format={format} match={editing} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={close} className="w-full sm:w-auto">Cancel</Button>
              <SubmitButton className="w-full sm:w-auto">Save changes</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Modal>
    </MatchEditContext.Provider>
  );
}

export function EditMatchButton({ match, size = "sm" }: { match: Match; size?: ButtonSize }) {
  const ctx = useContext(MatchEditContext);
  if (!ctx) throw new Error("EditMatchButton must be inside <MatchEditProvider>");
  return (
    <Button type="button" variant="secondary" size={size} onClick={() => ctx.open(match)} aria-label={`Edit ${match.home.name} v ${match.away.name}`}>
      ✏️ Edit
    </Button>
  );
}
