import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { changePasswordAction, signOutAction, updateProfileAction } from "@/app/actions";
import { TeamOptions } from "@/components/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Button, Field, Input, LinkButton, PageHeader, PasswordInput, Section, Select } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listTeamChoices } from "@/lib/league";
import { ROLE_LABEL, canManageLeague } from "@/lib/users";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/signin?next=/account");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Your account"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            @{me.username} <Badge tone={me.role === "fan" ? "neutral" : "brand"}>{ROLE_LABEL[me.role]}</Badge>
          </span>
        }
        actions={
          <form action={signOutAction}>
            <Button variant="secondary">Sign out</Button>
          </form>
        }
      />

      {canManageLeague(me) && (
        <Section title="Official tools" description={me.role === "admin" ? "You can manage every season, its officials, and users." : "You can manage the seasons the admin has added you to."}>
          <LinkButton href="/official" variant="primary">Open the official panel</LinkButton>
        </Section>
      )}

      <Section title="Profile">
        <ActionForm action={updateProfileAction} className="space-y-4">
          <Field label="Name">
            <Input name="name" required maxLength={60} defaultValue={me.name} autoComplete="name" />
          </Field>
          <Field label="Favourite team" hint="Shown on your home page with its next match, position and form.">
            {/* key: remount after save so the form reset shows the saved team (see SquadEditor) */}
            <Select key={me.favouriteTeamId ?? ""} name="favouriteTeamId" defaultValue={me.favouriteTeamId ?? ""}>
              <option value="">No favourite</option>
              <TeamOptions teams={await listTeamChoices(getDb())} />
            </Select>
          </Field>
          <SubmitButton className="w-full sm:w-auto">Save profile</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Change password">
        <ActionForm action={changePasswordAction} className="space-y-4">
          <Field label="Current password">
            <PasswordInput name="currentPassword" required autoComplete="current-password" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" hint="At least 8 characters.">
              <PasswordInput name="newPassword" required minLength={8} autoComplete="new-password" />
            </Field>
            <Field label="Repeat new password">
              <PasswordInput name="confirmPassword" required minLength={8} autoComplete="new-password" />
            </Field>
          </div>
          <SubmitButton variant="secondary" className="w-full sm:w-auto">Change password</SubmitButton>
        </ActionForm>
      </Section>
    </div>
  );
}
