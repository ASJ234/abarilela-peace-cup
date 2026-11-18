import { Card } from "./Card";

const ALERT_TONE = {
  error: "bg-rel-bg text-rel",
  success: "bg-top-bg text-top",
  info: "bg-surface-2 text-fg",
} as const;

/** A coloured message box (errors, warnings, confirmations). */
export function Alert({
  tone = "info",
  children,
  className = "",
}: {
  tone?: keyof typeof ALERT_TONE;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${ALERT_TONE[tone]} ${className}`}>
      {children}
    </p>
  );
}

/** Placeholder for lists with nothing in them yet. */
export function EmptyState({ icon, title, children }: { icon?: string; title?: string; children?: React.ReactNode }) {
  return (
    <Card className="px-4 py-8 text-center sm:px-6">
      {icon && <p className="text-3xl" aria-hidden>{icon}</p>}
      {title && <p className="mt-2 font-semibold">{title}</p>}
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </Card>
  );
}

const BADGE_TONE = {
  neutral: "bg-surface-2 text-muted",
  brand: "bg-brand text-brand-fg",
  success: "bg-top-bg text-top",
  danger: "bg-rel-bg text-rel",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE_TONE; children: React.ReactNode }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${BADGE_TONE[tone]}`}>{children}</span>;
}
