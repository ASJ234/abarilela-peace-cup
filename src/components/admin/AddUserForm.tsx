import { createUserAction } from "@/app/actions";
import type { TeamChoices } from "@/components/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, PasswordInput } from "@/components/ui";
import { UserFields } from "./UserFields";

/** Admin creates an account (e.g. for an official) and gives them the username and password. */
export function AddUserForm({ teams }: { teams: TeamChoices }) {
  return (
    <ActionForm action={createUserAction} className="space-y-4">
      <UserFields teams={teams} />
      <Field label="Password" hint="At least 8 characters. Give it to the user; they can change it on their Account page.">
        <PasswordInput name="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <SubmitButton pendingText="Creating…" className="w-full sm:w-auto">Create user</SubmitButton>
    </ActionForm>
  );
}
