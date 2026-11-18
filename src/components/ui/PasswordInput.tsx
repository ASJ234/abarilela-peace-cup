"use client";

import { useState, type ComponentProps } from "react";
import { inputClass } from "./Field";

/** Password field with a Show/Hide toggle. */
export function PasswordInput({ className = "", ...props }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${inputClass} pr-16 ${className}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex min-w-14 items-center justify-center rounded-r-lg px-3 text-xs font-semibold text-muted hover:text-fg"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
