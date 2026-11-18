import Link from "next/link";
import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "dangerSolid" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-fg hover:opacity-90",
  secondary: "border border-border bg-surface text-fg hover:bg-surface-2",
  danger: "border border-rel/40 bg-surface text-rel hover:bg-rel-bg",
  dangerSolid: "bg-rel text-white hover:opacity-90",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-1.5 text-xs",
  md: "min-h-10 px-4 py-2 text-sm",
};

/** Class string for anything that should look like a button. */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = "") {
  return [
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    extra,
  ].join(" ");
}

type Style = { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant, size, className = "", ...props }: ComponentProps<"button"> & Style) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function LinkButton({ variant = "secondary", size, className = "", ...props }: ComponentProps<typeof Link> & Style) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}
