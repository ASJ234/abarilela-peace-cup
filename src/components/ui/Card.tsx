import type { ComponentProps } from "react";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div {...props} className={`rounded-xl border border-border bg-surface ${className}`} />;
}

/**
 * A titled card section, the main building block of official pages.
 * `tone="danger"` is for destructive areas such as "Delete season".
 */
export function Section({
  title,
  description,
  actions,
  tone = "default",
  children,
  className = "",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: "default" | "danger";
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border bg-surface p-4 sm:p-6 ${tone === "danger" ? "border-rel/40" : "border-border"} ${className}`}
    >
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className={`text-lg font-semibold ${tone === "danger" ? "text-rel" : ""}`}>{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
