"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="mx-auto max-w-sm space-y-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
      <div>
        <h1 className="text-xl font-bold">Official sign in</h1>
        <p className="mt-1 text-sm text-muted">
          Officials manage teams, squads, fixtures, results and match events.
        </p>
      </div>
      <Field label="Password">
        <Input name="password" type="password" required autoFocus autoComplete="current-password" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Signing in…" className="w-full">Sign in</SubmitButton>
    </form>
  );
}
