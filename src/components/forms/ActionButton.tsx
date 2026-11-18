"use client";

import { useActionState } from "react";
import type { ButtonSize, ButtonVariant, ConfirmOptions } from "@/components/ui";
import { HiddenFields, type ServerAction } from "./ActionForm";
import { deleteConfirm } from "./confirm";
import { SubmitButton } from "./SubmitButton";

/** One button that runs a server action (e.g. Remove), with optional confirmation. */
export function ActionButton({
  action,
  fields,
  children,
  confirm,
  variant = "secondary",
  size = "sm",
  className = "",
  pendingText = "…",
  "aria-label": ariaLabel,
}: {
  action: ServerAction;
  fields?: HiddenFields;
  children: React.ReactNode;
  confirm?: ConfirmOptions;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  pendingText?: string;
  "aria-label"?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="inline-flex flex-col items-end">
      <HiddenFields fields={fields} />
      <SubmitButton variant={variant} size={size} className={className} confirm={confirm} pendingText={pendingText} aria-label={ariaLabel}>
        {children}
      </SubmitButton>
      {state?.error && <span role="alert" className="mt-1 max-w-xs text-right text-xs text-rel">{state.error}</span>}
    </form>
  );
}

/** Delete/remove button with a standard confirmation dialog. */
export function DeleteButton({
  action,
  fields,
  what,
  detail,
  verb = "Delete",
  label,
  size = "sm",
  pendingText,
}: {
  action: ServerAction;
  fields: HiddenFields;
  /** What is being deleted, e.g. `"Riverside FC"`; used in the dialog title. */
  what: string;
  detail?: React.ReactNode;
  verb?: string;
  /** Button text (defaults to the verb). */
  label?: React.ReactNode;
  size?: ButtonSize;
  pendingText?: string;
}) {
  return (
    <ActionButton
      action={action}
      fields={fields}
      variant="danger"
      size={size}
      pendingText={pendingText ?? `${verb === "Delete" ? "Deleting" : "Removing"}…`}
      confirm={deleteConfirm(what, detail, verb)}
      aria-label={typeof label === "string" ? undefined : `${verb} ${what}`}
    >
      {label ?? verb}
    </ActionButton>
  );
}
