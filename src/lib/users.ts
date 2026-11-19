import crypto from "node:crypto";
import type { Db } from "./sql";
import { LeagueError, type Row, cleanText, optionalId, requiredText } from "./validate";

export type Role = "fan" | "official" | "admin";
export const ROLE_LABEL: Record<Role, string> = { fan: "Fan", official: "Official", admin: "Admin" };

export type User = {
  id: number;
  username: string;
  name: string;
  role: Role;
  favouriteTeamId: number | null;
  createdAt: string;
};

export const canManageLeague = (u: Pick<User, "role"> | null | undefined) => u?.role === "official" || u?.role === "admin";

/** 3–30 characters: letters, numbers, dot, underscore or hyphen. */
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
export const MIN_PASSWORD = 8;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function toUser(r: Row): User {
  return {
    id: Number(r.id),
    username: String(r.username),
    name: String(r.name),
    role: r.role as Role,
    favouriteTeamId: r.favourite_team_id == null ? null : Number(r.favourite_team_id),
    createdAt: String(r.created_at),
  };
}

// ---------------------------------------------------------------------------
// Passwords (scrypt, a memory-hard hash built into Node)
// ---------------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/** Usernames are case-insensitive and stored in lower case: "Joel" and "joel" are the same account. */
export function normaliseUsername(v: unknown): string {
  return cleanText(v).toLowerCase();
}

function validUsername(v: unknown): string {
  const username = normaliseUsername(v);
  if (!USERNAME_RE.test(username)) {
    throw new LeagueError("Choose a username of 3–30 characters using letters, numbers, dots, dashes or underscores (no spaces).");
  }
  return username;
}

function validPassword(v: unknown): string {
  const pw = String(v ?? "");
  if (pw.length < MIN_PASSWORD) throw new LeagueError(`Use a password of at least ${MIN_PASSWORD} characters.`);
  if (pw.length > 200) throw new LeagueError("That password is too long.");
  return pw;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function getUser(db: Db, id: number): Promise<User | null> {
  const r = await db.get("SELECT * FROM users WHERE id = ?", [id]);
  return r ? toUser(r) : null;
}

export async function listUsers(db: Db): Promise<User[]> {
  const rows = await db.all("SELECT * FROM users ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'official' THEN 1 ELSE 2 END, name");
  return rows.map(toUser);
}

async function teamExists(db: Db, teamId: number): Promise<boolean> {
  return Boolean(await db.get("SELECT 1 FROM teams WHERE id = ?", [teamId]));
}

/**
 * Creates a fan account (the display name defaults to the username). There's no public
 * sign-up; the admin creates accounts through adminCreateUser.
 */
export async function signUp(
  db: Db,
  input: { username: unknown; password: unknown; name?: unknown; favouriteTeamId?: unknown },
): Promise<User> {
  const username = validUsername(input.username);
  const name = cleanText(input.name) ? requiredText(input.name, "Name", 60) : username;
  const password = validPassword(input.password);
  if (await db.get("SELECT 1 FROM users WHERE username = ?", [username])) {
    throw new LeagueError(`The username "${username}" is taken. Choose another, or sign in if it's yours.`);
  }
  const teamId = optionalId(input.favouriteTeamId);
  if (teamId != null && !(await teamExists(db, teamId))) {
    throw new LeagueError("That team doesn't exist.");
  }
  const r = await db.get(
    "INSERT INTO users (username, name, password_hash, role, favourite_team_id) VALUES (?, ?, ?, 'fan', ?) RETURNING *",
    [username, name, hashPassword(password), teamId],
  );
  return toUser(r!);
}

/**
 * Checks username + password. Returns the user, or null if either is wrong
 * (deliberately not saying which).
 */
export async function authenticate(db: Db, usernameRaw: unknown, password: unknown): Promise<User | null> {
  const r = await db.get("SELECT * FROM users WHERE username = ?", [normaliseUsername(usernameRaw)]);
  if (!r) {
    hashPassword(String(password ?? "")); // spend similar time so response speed doesn't reveal which usernames exist
    return null;
  }
  if (!verifyPassword(String(password ?? ""), String(r.password_hash))) return null;
  return toUser(r);
}

export async function getAdmin(db: Db): Promise<User | null> {
  const r = await db.get("SELECT * FROM users WHERE role = 'admin'");
  return r ? toUser(r) : null;
}

/**
 * The system has exactly one admin. Used by `npm run admin -- <username> <password>`:
 * - no admin yet: creates the account (or promotes an existing one) as admin;
 * - same username as the admin: resets the admin's password;
 * - a different admin exists: refused, unless `replace` is set, in which case
 *   the old admin becomes a fan and is signed out.
 */
export async function setUpAdmin(db: Db, usernameRaw: unknown, password: unknown, opts: { replace?: boolean } = {}): Promise<User> {
  const username = validUsername(usernameRaw);
  const hash = hashPassword(validPassword(password));
  return db.tx(async (t) => {
    const current = await getAdmin(t);
    if (current && current.username !== username && !opts.replace) {
      throw new LeagueError(
        `"${current.username}" is already the admin, and there can only be one. ` +
          `To make "${username}" the admin instead (and "${current.username}" a fan), add --replace.`,
      );
    }
    const endSessions = (id: number) => t.run("DELETE FROM sessions WHERE user_id = ?", [id]);
    if (current && current.username !== username) {
      await t.run("UPDATE users SET role = 'fan' WHERE id = ?", [current.id]);
      await endSessions(current.id);
    }
    const existing = await t.get("SELECT id FROM users WHERE username = ?", [username]);
    if (existing) {
      await t.run("UPDATE users SET role = 'admin', password_hash = ? WHERE id = ?", [hash, Number(existing.id)]);
      await endSessions(Number(existing.id)); // old sign-ins end with the old password
      return (await getUser(t, Number(existing.id)))!;
    }
    const r = await t.get(
      "INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, 'admin') RETURNING *",
      [username, username, hash],
    );
    return toUser(r!);
  });
}

export async function updateProfile(db: Db, userId: number, input: { name: unknown; favouriteTeamId: unknown }): Promise<void> {
  const name = requiredText(input.name, "Name", 60);
  const teamId = optionalId(input.favouriteTeamId);
  if (teamId != null && !(await teamExists(db, teamId))) {
    throw new LeagueError("That team doesn't exist.");
  }
  await db.run("UPDATE users SET name = ?, favourite_team_id = ? WHERE id = ?", [name, teamId, userId]);
}

export async function changePassword(db: Db, userId: number, current: unknown, next: unknown): Promise<void> {
  const r = await db.get("SELECT password_hash FROM users WHERE id = ?", [userId]);
  if (!r || !verifyPassword(String(current ?? ""), String(r.password_hash))) {
    throw new LeagueError("Your current password is not correct.");
  }
  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(validPassword(next)), userId]);
}

// ---------------------------------------------------------------------------
// User management by the admin (create / update / reset password / delete)
// ---------------------------------------------------------------------------

function assertAdmin(acting: User) {
  if (acting.role !== "admin") throw new LeagueError("Only the admin can manage users.");
}

/** A non-admin account the admin may manage. */
async function managedUser(db: Db, userId: number): Promise<User> {
  const target = await getUser(db, userId);
  if (!target) throw new LeagueError("User not found.");
  if (target.role === "admin") {
    throw new LeagueError("The admin account can't be changed here. Use your Account page for your own details.");
  }
  return target;
}

function parseManagedRole(v: unknown): Role {
  const role = String(v ?? "fan");
  if (role !== "fan" && role !== "official") throw new LeagueError("Choose Fan or Official.");
  return role;
}

async function parseTeam(db: Db, v: unknown): Promise<number | null> {
  const teamId = optionalId(v);
  if (teamId != null && !(await teamExists(db, teamId))) {
    throw new LeagueError("That team doesn't exist.");
  }
  return teamId;
}

export type ManagedUserInput = { username: unknown; name?: unknown; role?: unknown; favouriteTeamId?: unknown };

/** The admin adds an account (fan or official) and sets its first password. */
export async function adminCreateUser(db: Db, acting: User, input: ManagedUserInput & { password: unknown }): Promise<User> {
  assertAdmin(acting);
  const role = parseManagedRole(input.role);
  const user = await signUp(db, { username: input.username, name: input.name, password: input.password, favouriteTeamId: input.favouriteTeamId });
  if (role === "fan") return user;
  const r = await db.get("UPDATE users SET role = ? WHERE id = ? RETURNING *", [role, user.id]);
  return toUser(r!);
}

/** The admin edits an account's username, display name, role and favourite team. */
export async function adminUpdateUser(db: Db, acting: User, userId: number, input: ManagedUserInput): Promise<User> {
  assertAdmin(acting);
  const target = await managedUser(db, userId);
  const username = validUsername(input.username);
  if (await db.get("SELECT 1 FROM users WHERE username = ? AND id <> ?", [username, userId])) {
    throw new LeagueError(`The username "${username}" is taken.`);
  }
  const name = cleanText(input.name) ? requiredText(input.name, "Name", 60) : username;
  const role = parseManagedRole(input.role);
  const teamId = await parseTeam(db, input.favouriteTeamId);
  return db.tx(async (t) => {
    const r = await t.get(
      "UPDATE users SET username = ?, name = ?, role = ?, favourite_team_id = ? WHERE id = ? RETURNING *",
      [username, name, role, teamId, userId],
    );
    // Losing official access takes effect straight away, and their seasons go with it.
    if (target.role === "official" && role === "fan") {
      await t.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
      await t.run("DELETE FROM season_officials WHERE user_id = ?", [userId]);
    }
    return toUser(r!);
  });
}

/** The admin sets a new password for an account (e.g. it was forgotten). The user is signed out everywhere. */
export async function adminResetPassword(db: Db, acting: User, userId: number, password: unknown): Promise<User> {
  assertAdmin(acting);
  const target = await managedUser(db, userId);
  const hash = hashPassword(validPassword(password));
  await db.tx(async (t) => {
    await t.run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, userId]);
    await t.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
  });
  return target;
}

/** The admin removes an account; its sign-ins end with it. */
export async function adminDeleteUser(db: Db, acting: User, userId: number): Promise<User> {
  assertAdmin(acting);
  const target = await managedUser(db, userId);
  await db.run("DELETE FROM users WHERE id = ?", [userId]); // sessions cascade
  return target;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Creates a session and returns the raw token for the cookie (only its hash is stored). */
export async function createSession(db: Db, userId: number, ttlSeconds = SESSION_TTL_SECONDS): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  await db.run("DELETE FROM sessions WHERE expires_at < ?", [now]); // tidy up
  await db.run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [sha256(token), userId, now + ttlSeconds]);
  return token;
}

export async function sessionUser(db: Db, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const r = await db.get(
    "SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
    [sha256(token)],
  );
  if (!r) return null;
  if (Number(r.expires_at) < Date.now() / 1000) {
    await deleteSession(db, token);
    return null;
  }
  return toUser(r);
}

export async function deleteSession(db: Db, token: string | undefined): Promise<void> {
  if (token) await db.run("DELETE FROM sessions WHERE token_hash = ?", [sha256(token)]);
}
