/** "2026-11-21" -> "Sat 21 Nov 2026" (formatted in UTC so the day never shifts). */
export function formatDate(iso: string | null, opts: { weekday?: boolean; year?: boolean } = {}): string {
  if (!iso) return "Date to be confirmed";
  const { weekday = true, year = true } = opts;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: weekday ? "short" : undefined,
    day: "numeric",
    month: "short",
    year: year ? "numeric" : undefined,
  });
}

/** Group items by a key while keeping first-seen order. */
export function groupBy<T, K>(items: T[], key: (t: T) => K): Array<[K, T[]]> {
  const map = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = map.get(k);
    if (list) list.push(it);
    else map.set(k, [it]);
  }
  return [...map.entries()];
}

/** A redirect target inside this site ("/official"), never another domain; defaults to "/". */
export function safeNextPath(raw: unknown): string {
  const next = typeof raw === "string" ? raw : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

/** "Joel Ariko" -> "JA" (for avatars). */
export function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}
