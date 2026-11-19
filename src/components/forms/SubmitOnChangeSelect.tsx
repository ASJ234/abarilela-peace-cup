"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Select } from "@/components/ui";

/**
 * A <select> inside a server-action form that submits the form as soon as a new
 * option is picked, so the choice saves without pressing the Save button.
 */
export function SubmitOnChangeSelect({ onChange, disabled, ...props }: ComponentProps<"select">) {
  const { pending } = useFormStatus();
  return (
    <Select
      {...props}
      disabled={disabled || pending}
      onChange={(e) => {
        onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
