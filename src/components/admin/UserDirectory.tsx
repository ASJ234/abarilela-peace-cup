"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { deleteUserAction, resetUserPasswordAction, updateUserAction } from "@/app/actions";
import type { TeamChoices } from "@/components/auth";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms";
import { Badge, Button, EmptyState, Field, Input, Modal, PasswordInput } from "@/components/ui";
import { initials } from "@/lib/format";
import { type ManagedUser, UserFields } from "./UserFields";

const ROLE: Record<ManagedUser["role"], { label: string; tone: "brand" | "success" | "neutral" }> = {
  admin: { label: "Admin", tone: "brand" },
  official: { label: "Official", tone: "success" },
  fan: { label: "Fan", tone: "neutral" },
};

/**
 * Searchable list of every account, grouped by role, with Edit (dialog) and
 * Delete for everyone except the admin.
 */
export function UserDirectory({
  users,
  meId,
  teams,
  seasons,
}: {
  users: ManagedUser[];
  meId: number;
  teams: TeamChoices;
  /** Each official's seasons (user id → season names). */
  seasons: Record<number, string[]>;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const teamName = useMemo(() => new Map(teams.flatMap((s) => s.teams.map((t) => [t.id, t.name] as const))), [teams]);

  const q = query.trim().toLowerCase();
  const shown = q ? users.filter((u) => u.username.includes(q) || u.name.toLowerCase().includes(q)) : users;
  const sections = (["admin", "official", "fan"] as const)
    .map((role) => ({ role, list: shown.filter((u) => u.role === role) }))
    .filter((s) => s.list.length > 0);

  return (
    <div className="space-y-4">
      <Field label="Search users">
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or username" />
      </Field>

      {sections.length === 0 && <EmptyState icon="🔍">No user matches &ldquo;{query}&rdquo;.</EmptyState>}

      {sections.map(({ role, list }) => (
        <section key={role}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            {role === "admin" ? "Admin" : role === "official" ? "Officials" : "Fans"} ({list.length})
          </h3>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {list.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 p-3">
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold">
                  {initials(u.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{u.name}</span>
                    <Badge tone={ROLE[u.role].tone}>{ROLE[u.role].label}</Badge>
                    {u.id === meId && <span className="text-xs text-muted">(you)</span>}
                  </span>
                  <span className="block truncate text-sm text-muted">
                    @{u.username}
                    {u.favouriteTeamId != null && teamName.get(u.favouriteTeamId) && <> · ⭐ {teamName.get(u.favouriteTeamId)}</>}
                  </span>
                  {u.role === "official" && (
                    <span className="block text-sm text-muted">
                      🏆 {seasons[u.id]?.length ? seasons[u.id].join(", ") : "No seasons yet (add them in a season's Settings)"}
                    </span>
                  )}
                </span>
                {u.role === "admin" ? (
                  <Link href="/account" className="text-sm font-semibold text-brand hover:underline">Your account →</Link>
                ) : (
                  <span className="flex w-full gap-2 sm:w-auto">
                    <Button type="button" variant="secondary" size="sm" className="flex-1 sm:flex-none" onClick={() => setEditing(u)}>
                      ✏️ Edit
                    </Button>
                    <DeleteButton
                      action={deleteUserAction}
                      fields={{ userId: u.id }}
                      what={`@${u.username}`}
                      detail={`${u.name}'s account will be permanently deleted and they'll be signed out. ${
                        u.role === "official" ? "They'll lose official access. " : ""
                      }League data they entered (results, goals, etc.) stays.`}
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Modal
        open={editing != null}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing ? `Edit @${editing.username}` : "Edit user"}
        description={editing ? `Joined ${editing.createdAt.slice(0, 10)}` : undefined}
      >
        {editing && (
          <div className="space-y-6">
            <ActionForm key={`p${editing.id}`} action={updateUserAction} fields={{ userId: editing.id }} onSuccess={() => setEditing(null)} className="space-y-4">
              <UserFields user={editing} teams={teams} />
              <p className="text-xs text-muted">Changing an official to a fan signs them out of the official tools straight away.</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={() => setEditing(null)} className="w-full sm:w-auto">Cancel</Button>
                <SubmitButton className="w-full sm:w-auto">Save changes</SubmitButton>
              </div>
            </ActionForm>

            <ActionForm key={`pw${editing.id}`} action={resetUserPasswordAction} fields={{ userId: editing.id }} className="space-y-3 border-t border-border pt-4">
              <p className="font-semibold">Set a new password</p>
              <p className="text-sm text-muted">For a forgotten password. {editing.name} will be signed out and must use the new one.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="New password" hint="At least 8 characters.">
                  <PasswordInput name="password" required minLength={8} autoComplete="new-password" />
                </Field>
                <Field label="Repeat new password">
                  <PasswordInput name="confirmPassword" required minLength={8} autoComplete="new-password" />
                </Field>
              </div>
              <SubmitButton
                variant="secondary"
                className="w-full sm:w-auto"
                confirm={{
                  title: `Set a new password for @${editing.username}?`,
                  message: "They'll be signed out on every device and must sign in with the new password.",
                  confirmLabel: "Set password",
                  tone: "primary",
                }}
              >
                Set new password
              </SubmitButton>
            </ActionForm>
          </div>
        )}
      </Modal>
    </div>
  );
}
