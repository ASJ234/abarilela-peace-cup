import Link from "next/link";

/** Page title with optional back link, subtitle and action buttons; stacks on phones. */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  level = 1,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
  level?: 1 | 2;
}) {
  const H = level === 1 ? "h1" : "h2";
  return (
    <div className="mb-4">
      {back && (
        <Link href={back.href} className="inline-flex min-h-9 items-center text-sm text-muted hover:text-fg hover:underline">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <H className={`font-bold tracking-tight ${level === 1 ? "text-2xl sm:text-3xl" : "text-xl"}`}>{title}</H>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
