"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, signUpAction } from "@/app/actions";
import { FormMessage, HiddenFields, SubmitButton } from "@/components/forms";
import { Field, Input, PasswordInput, Select } from "@/components/ui";
import type { TeamChoices } from "./TeamSelect";
import { TeamOptions } from "./TeamSelect";

const withNext = (path: string, next: string) => (next && next !== "/" ? `${path}?next=${encodeURIComponent(next)}` : path);

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <HiddenFields fields={{ next }} />
      <Field label="Username">
        <Input name="username" required autoComplete="username" autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </Field>
      <Field label="Password">
        <PasswordInput name="password" required autoComplete="current-password" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Signing in…" className="w-full">Sign in</SubmitButton>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href={withNext("/signup", next)} className="font-semibold text-brand hover:underline">Create an account</Link>
      </p>
    </form>
  );
}

export function SignUpForm({ next, teams }: { next: string; teams: TeamChoices }) {
  const [state, action] = useActionState(signUpAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <HiddenFields fields={{ next }} />
      <Field label="Username" hint="3–30 characters: letters, numbers, dots, dashes or underscores. You'll use it to sign in.">
        <Input
          name="username"
          required
          minLength={3}
          maxLength={30}
          pattern="[A-Za-z0-9._\-]{3,30}"
          autoComplete="username"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>
      <Field label="Display name (optional)" hint="Shown on the site instead of your username.">
        <Input name="name" maxLength={60} autoComplete="name" />
      </Field>
      <Field label="Password" hint="At least 8 characters.">
        <PasswordInput name="password" required minLength={8} autoComplete="new-password" />
      </Field>
      {teams.length > 0 && (
        <Field label="Favourite team (optional)" hint="We'll show its next match, position and form on your home page.">
          <Select name="favouriteTeamId" defaultValue="">
            <option value="">No favourite yet</option>
            <TeamOptions teams={teams} />
          </Select>
        </Field>
      )}
      <FormMessage state={state} />
      <SubmitButton pendingText="Creating account…" className="w-full">Create account</SubmitButton>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href={withNext("/signin", next)} className="font-semibold text-brand hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
