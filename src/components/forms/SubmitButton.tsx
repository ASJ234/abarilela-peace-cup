"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, ConfirmDialog, Spinner, type ButtonSize, type ButtonVariant, type ConfirmOptions } from "@/components/ui";

/**
 * Submit button for server-action forms. Shows a spinner and a pending label while saving
 * (including the page change when the action redirects, e.g. after signing in).
 * With `confirm`, it first opens a dialog with Cancel / Confirm buttons and only
 * submits the form if the user confirms.
 */
export function SubmitButton({
  children,
  pendingText = "Saving…",
  variant = "primary",
  size = "md",
  className = "",
  confirm,
  disabled = false,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  confirm?: ConfirmOptions;
  /** Can't be pressed (e.g. something must be done first). */
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const { pending } = useFormStatus();
  const [asking, setAsking] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        ref={ref}
        type="submit"
        variant={variant}
        size={size}
        disabled={pending || disabled}
        aria-busy={pending || undefined}
        aria-label={ariaLabel}
        className={`${className} aria-busy:disabled:opacity-90`}
        onClick={(e) => {
          if (confirm) {
            e.preventDefault();
            setAsking(true);
          }
        }}
      >
        {pending ? (
          <>
            <Spinner />
            {pendingText}
          </>
        ) : (
          children
        )}
      </Button>
      {confirm && (
        <ConfirmDialog
          {...confirm}
          open={asking}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            // Submit with this button as the submitter (doesn't re-trigger onClick).
            ref.current?.form?.requestSubmit(ref.current);
          }}
        />
      )}
    </>
  );
}
