/** Centered card layout for the sign-in / sign-up pages, with a short welcome panel. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface md:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand p-8 text-brand-fg md:flex">
        <PitchLines />
        <div className="relative">
          <p className="text-4xl" aria-hidden>🕊️⚽</p>
          <p className="mt-4 text-2xl font-black leading-tight">Football that brings communities together.</p>
        </div>
        <ul className="relative space-y-2 text-sm opacity-90">
          <li>✓ Follow your team: next match, position and form</li>
          <li>✓ Live tables, fixtures and results</li>
          <li>✓ Top scorers, assists and the Fair Play race</li>
        </ul>
      </div>
      <div className="p-5 sm:p-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

/** Faint football-pitch markings used as a decorative background. */
export function PitchLines({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 260"
      preserveAspectRatio="xMidYMid slice"
      className={`pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="10" y="10" width="380" height="240" rx="4" />
      <line x1="200" y1="10" x2="200" y2="250" />
      <circle cx="200" cy="130" r="38" />
      <circle cx="200" cy="130" r="3" fill="currentColor" />
      <rect x="10" y="70" width="60" height="120" />
      <rect x="330" y="70" width="60" height="120" />
      <rect x="10" y="100" width="22" height="60" />
      <rect x="368" y="100" width="22" height="60" />
      <path d="M70 105 A 30 30 0 0 1 70 155" />
      <path d="M330 105 A 30 30 0 0 0 330 155" />
    </svg>
  );
}
