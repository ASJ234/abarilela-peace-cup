import type { ComponentProps } from "react";

export const inputClass =
  "w-full min-h-10 rounded-lg border border-border bg-surface px-3 py-2 text-base text-fg outline-none " +
  "placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:opacity-60 sm:text-sm";

/** Label + control + optional hint. Wraps the control in <label> so they're linked. */
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${className}`} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${inputClass} ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${inputClass} ${className}`} />;
}

export function Checkbox({ label, ...props }: ComponentProps<"input"> & { label: React.ReactNode }) {
  return (
    <label className="flex min-h-9 items-start gap-3 text-sm">
      <input type="checkbox" {...props} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]" />
      <span>{label}</span>
    </label>
  );
}
