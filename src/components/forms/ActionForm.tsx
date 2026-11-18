"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions";
import { Alert } from "@/components/ui";

export type ServerAction = (prev: FormState, fd: FormData) => Promise<FormState>;
export type HiddenFields = Record<string, string | number>;

export function HiddenFields({ fields }: { fields?: HiddenFields }) {
  return (
    <>
      {Object.entries(fields ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </>
  );
}

/** Success / error message from a server action. */
export function FormMessage({ state, inline }: { state: FormState; inline?: boolean }) {
  if (!state || (!state.error && !state.ok)) return null;
  if (inline) {
    return (
      <span role={state.error ? "alert" : "status"} className={`text-sm ${state.error ? "text-rel" : "text-top"}`}>
        {state.error ?? `✓ ${state.ok}`}
      </span>
    );
  }
  return <Alert tone={state.error ? "error" : "success"}>{state.error ?? `✓ ${state.ok}`}</Alert>;
}

/**
 * A form bound to a server action that shows the action's result message.
 * Server components can use it to build forms without writing a client component.
 */
export function ActionForm({
  action,
  fields,
  children,
  className = "space-y-3",
  inlineMessage = false,
  hideSuccess = false,
  onSuccess,
}: {
  action: ServerAction;
  fields?: HiddenFields;
  children: React.ReactNode;
  className?: string;
  inlineMessage?: boolean;
  /** Only show errors (for small inline edits where success is obvious). */
  hideSuccess?: boolean;
  /** Called after the action succeeds (e.g. to close a dialog). */
  onSuccess?: (message: string) => void;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => { onSuccessRef.current = onSuccess; });
  useEffect(() => {
    if (state?.ok) onSuccessRef.current?.(state.ok);
  }, [state]);
  return (
    <form action={formAction} className={className}>
      <HiddenFields fields={fields} />
      {children}
      <FormMessage state={hideSuccess && state?.ok ? undefined : state} inline={inlineMessage} />
    </form>
  );
}
