/**
 * Places matches onto playing dates.
 *
 * Matches are taken in order (matchday 1 first). Each date takes as many as
 * fit, subject to:
 *  - `maxPerDay`: cap on matches per date (null = no cap);
 *  - `oncePerDay`: a team plays at most one match per date.
 * Kick-off times, if given, are handed out in order within each day
 * (1st match of the day gets the 1st time, and so on).
 */
export type ScheduleOptions = {
  maxPerDay?: number | null;
  oncePerDay?: boolean;
  kickoffTimes?: string[];
};

export type Scheduled<M> = { match: M; date: string; kickoff: string | null };

export class SchedulingError extends Error {
  constructor(public unscheduled: number) {
    super(`Ran out of playing dates: ${unscheduled} match${unscheduled === 1 ? "" : "es"} could not be scheduled.`);
  }
}

export function scheduleMatches<M extends { home: number; away: number }>(
  matches: M[],
  dates: string[],
  opts: ScheduleOptions = {},
): Scheduled<M>[] {
  const { maxPerDay = null, oncePerDay = true, kickoffTimes = [] } = opts;
  const queue = [...matches];
  const out: Scheduled<M>[] = [];

  for (const date of [...dates].sort()) {
    if (!queue.length) break;
    const busy = new Set<number>();
    let count = 0;
    for (let i = 0; i < queue.length && (maxPerDay == null || count < maxPerDay); ) {
      const m = queue[i];
      if (oncePerDay && (busy.has(m.home) || busy.has(m.away))) { i++; continue; }
      busy.add(m.home);
      busy.add(m.away);
      out.push({ match: m, date, kickoff: kickoffTimes[count] ?? null });
      count++;
      queue.splice(i, 1);
    }
  }

  if (queue.length) throw new SchedulingError(queue.length);
  return out;
}

/** Fewest dates that could possibly fit the matches (a lower bound for the UI). */
export function minDatesNeeded(totalMatches: number, matchdays: number, opts: ScheduleOptions): number {
  if (totalMatches === 0) return 0;
  const byCap = opts.maxPerDay ? Math.ceil(totalMatches / opts.maxPerDay) : 1;
  const byTeams = opts.oncePerDay === false ? 1 : matchdays;
  return Math.max(byCap, byTeams);
}
