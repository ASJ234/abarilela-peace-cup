import type { DatabaseSync } from "node:sqlite";

/** A user-facing validation/business-rule error (shown to the official as-is). */
export class LeagueError extends Error {}

export type Row = Record<string, unknown>;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const isBlank = (v: unknown) => v == null || String(v).trim() === "";

export function wholeNumber(value: unknown, field: string, max = 1000): number {
  const n = Number(value);
  if (isBlank(value) || !Number.isInteger(n) || n < 0 || n > max) {
    throw new LeagueError(`${field} must be a whole number between 0 and ${max}.`);
  }
  return n;
}

export function optionalNumber(value: unknown, field: string, max = 1000): number | null {
  return isBlank(value) ? null : wholeNumber(value, field, max);
}

/** Trims and collapses runs of spaces/tabs inside, so "Riverside   FC" becomes "Riverside FC". */
export function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Splits a pasted list of names on new lines and commas, tidying spaces and
 * dropping empty entries: "A, B\n\n C ,,D" -> ["A", "B", "C", "D"].
 */
export function splitNameList(text: unknown): string[] {
  return String(text ?? "").split(/[\r\n,]+/).map(cleanText).filter(Boolean);
}

export function requiredText(value: unknown, field: string, max = 60): string {
  const s = cleanText(value);
  if (!s) throw new LeagueError(`${field} is required.`);
  if (s.length > max) throw new LeagueError(`${field} must be at most ${max} characters.`);
  return s;
}

export function optionalText(value: unknown, field: string, max = 60): string | null {
  return isBlank(value) ? null : requiredText(value, field, max);
}

export function optionalDate(value: unknown): string | null {
  if (isBlank(value)) return null;
  const d = String(value).trim();
  if (!DATE_RE.test(d) || Number.isNaN(Date.parse(d))) throw new LeagueError(`"${d}" is not a valid date.`);
  return d;
}

export function optionalTime(value: unknown): string | null {
  if (isBlank(value)) return null;
  const t = String(value).trim();
  if (!TIME_RE.test(t)) throw new LeagueError(`"${t}" is not a valid time. Use HH:MM, e.g. 14:30.`);
  return t;
}

export function optionalId(value: unknown): number | null {
  if (isBlank(value)) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
