"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction } from "@/app/actions";
import { FormMessage, HiddenFields, SubmitButton } from "@/components/forms";
import { Field, Input, PasswordInput } from "@/components/ui";

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
        No account needed to follow the tournament.{" "}
        <Link href="/" className="font-semibold text-brand hover:underline">Back to the site</Link>
      </p>
    </form>
  );
}
