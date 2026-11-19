import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getDb } from "./db";
import {
  SESSION_TTL_SECONDS, type User, authenticate, canManageLeague, createSession, deleteSession, normaliseUsername, sessionUser,
  signUp,
} from "./users";

const COOKIE = "apc_session";

/** The signed-in user for this request (looked up once per request). */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  return await sessionUser(getDb(), (await cookies()).get(COOKIE)?.value);
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
  const token = await createSession(getDb(), userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

// --- Slow down password guessing: 5 failures per username locks it for 10 minutes. ---
const FAIL_LIMIT = 5;
const LOCK_MS = 10 * 60 * 1000;
const failures = new Map<string, { count: number; since: number }>();

function lockedFor(username: string): number {
  const f = failures.get(username);
  if (!f || f.count < FAIL_LIMIT) return 0;
  const left = f.since + LOCK_MS - Date.now();
  if (left <= 0) { failures.delete(username); return 0; }
  return Math.ceil(left / 60000);
}

function recordFailure(username: string) {
  const f = failures.get(username);
  if (!f || Date.now() - f.since > LOCK_MS) failures.set(username, { count: 1, since: Date.now() });
  else f.count++;
}

export type AuthResult = { ok: true; user: User } | { ok: false; error: string };

export async function signInWithPassword(username: string, password: string): Promise<AuthResult> {
  const key = normaliseUsername(username);
  const minutes = lockedFor(key);
  if (minutes) return { ok: false, error: `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  const user = await authenticate(getDb(), key, password);
  if (!user) {
    recordFailure(key);
    return { ok: false, error: "Wrong username or password." };
  }
  failures.delete(key);
  await startSession(user.id);
  return { ok: true, user };
}

/** Creates the account (may throw LeagueError) and signs it in. */
export async function registerAndSignIn(input: { username: unknown; password: unknown; name?: unknown; favouriteTeamId?: unknown }) {
  const user = await signUp(getDb(), input);
  await startSession(user.id);
  return user;
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  await deleteSession(getDb(), jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
}
