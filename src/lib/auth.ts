import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getDb } from "./db";
import {
  SESSION_TTL_SECONDS, type User, authenticate, canManageLeague, createSession, deleteSession, sessionUser, signUp,
} from "./users";

const COOKIE = "apc_session";

/** Emails that become admin when they sign up or sign in (ADMIN_EMAIL, comma-separated). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** The signed-in user for this request (looked up once per request). */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  return sessionUser(getDb(), (await cookies()).get(COOKIE)?.value);
});

/** Officials and the admin can manage seasons, fixtures and results. */
export async function isOfficial(): Promise<boolean> {
  return canManageLeague(await getCurrentUser());
}

export async function isAdmin(): Promise<boolean> {
  return (await getCurrentUser())?.role === "admin";
}

async function startSession(userId: number) {
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(COOKIE, createSession(getDb(), userId), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

// --- Slow down password guessing: 5 failures per email locks it for 10 minutes. ---
const FAIL_LIMIT = 5;
const LOCK_MS = 10 * 60 * 1000;
const failures = new Map<string, { count: number; since: number }>();

function lockedFor(email: string): number {
  const f = failures.get(email);
  if (!f || f.count < FAIL_LIMIT) return 0;
  const left = f.since + LOCK_MS - Date.now();
  if (left <= 0) { failures.delete(email); return 0; }
  return Math.ceil(left / 60000);
}

function recordFailure(email: string) {
  const f = failures.get(email);
  if (!f || Date.now() - f.since > LOCK_MS) failures.set(email, { count: 1, since: Date.now() });
  else f.count++;
}

export type AuthResult = { ok: true; user: User } | { ok: false; error: string };

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const key = email.trim().toLowerCase();
  const minutes = lockedFor(key);
  if (minutes) return { ok: false, error: `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  const user = authenticate(getDb(), key, password, adminEmails());
  if (!user) {
    recordFailure(key);
    return { ok: false, error: "Wrong email or password." };
  }
  failures.delete(key);
  await startSession(user.id);
  return { ok: true, user };
}

/** Creates the account (may throw LeagueError) and signs it in. */
export async function registerAndSignIn(input: { name: unknown; email: unknown; password: unknown; favouriteTeamId?: unknown }) {
  const user = signUp(getDb(), input, adminEmails());
  await startSession(user.id);
  return user;
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  deleteSession(getDb(), jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
}
