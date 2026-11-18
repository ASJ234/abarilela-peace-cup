import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { LeagueError, type Row, cleanText, optionalId, requiredText, tx } from "./validate";

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

export function getUser(db: DatabaseSync, id: number): User | null {
  const r = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return r ? toUser(r) : null;
}

export function listUsers(db: DatabaseSync): User[] {
  return db
    .prepare("SELECT * FROM users ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'official' THEN 1 ELSE 2 END, name")
    .all()
    .map(toUser);
}

/** New accounts are fans. The display name defaults to the username. */
export function signUp(
  db: DatabaseSync,
  input: { username: unknown; password: unknown; name?: unknown; favouriteTeamId?: unknown },
): User {
  const username = validUsername(input.username);
  const name = cleanText(input.name) ? requiredText(input.name, "Name", 60) : username;
  const password = validPassword(input.password);
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) {
    throw new LeagueError(`The username "${username}" is taken. Choose another, or sign in if it's yours.`);
  }
  const teamId = optionalId(input.favouriteTeamId);
  if (teamId != null && !db.prepare("SELECT 1 FROM teams WHERE id = ?").get(teamId)) {
    throw new LeagueError("That team doesn't exist.");
  }
  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (username, name, password_hash, role, favourite_team_id) VALUES (?, ?, ?, 'fan', ?)")
    .run(username, name, hashPassword(password), teamId);
  return getUser(db, Number(lastInsertRowid))!;
}

/**
 * Checks username + password. Returns the user, or null if either is wrong
 * (deliberately not saying which).
 */
export function authenticate(db: DatabaseSync, usernameRaw: unknown, password: unknown): User | null {
  const r = db.prepare("SELECT * FROM users WHERE username = ?").get(normaliseUsername(usernameRaw));
  if (!r) {
    hashPassword(String(password ?? "")); // spend similar time so response speed doesn't reveal which usernames exist
    return null;
  }
  if (!verifyPassword(String(password ?? ""), String(r.password_hash))) return null;
  return getUser(db, Number(r.id));
}

export function getAdmin(db: DatabaseSync): User | null {
  const r = db.prepare("SELECT * FROM users WHERE role = 'admin'").get();
  return r ? toUser(r) : null;
}

/**
 * The system has exactly one admin. Used by `npm run admin -- <username> <password>`:
 * - no admin yet: creates the account (or promotes an existing one) as admin;
 * - same username as the admin: resets the admin's password;
 * - a different admin exists: refused, unless `replace` is set, in which case
 *   the old admin becomes a fan and is signed out.
 */
export function setUpAdmin(db: DatabaseSync, usernameRaw: unknown, password: unknown, opts: { replace?: boolean } = {}): User {
  const username = validUsername(usernameRaw);
  const hash = hashPassword(validPassword(password));
  const current = getAdmin(db);
  if (current && current.username !== username && !opts.replace) {
    throw new LeagueError(
      `"${current.username}" is already the admin, and there can only be one. ` +
        `To make "${username}" the admin instead (and "${current.username}" a fan), add --replace.`,
    );
  }
  const endSessions = (id: number) => db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  return tx(db, () => {
    if (current && current.username !== username) {
      db.prepare("UPDATE users SET role = 'fan' WHERE id = ?").run(current.id);
      endSessions(current.id);
    }
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) {
      db.prepare("UPDATE users SET role = 'admin', password_hash = ? WHERE id = ?").run(hash, Number(existing.id));
      endSessions(Number(existing.id)); // old sign-ins end with the old password
      return getUser(db, Number(existing.id))!;
    }
    const { lastInsertRowid } = db
      .prepare("INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, 'admin')")
      .run(username, username, hash);
    return getUser(db, Number(lastInsertRowid))!;
  });
}

export function updateProfile(db: DatabaseSync, userId: number, input: { name: unknown; favouriteTeamId: unknown }): void {
  const name = requiredText(input.name, "Name", 60);
  const teamId = optionalId(input.favouriteTeamId);
  if (teamId != null && !db.prepare("SELECT 1 FROM teams WHERE id = ?").get(teamId)) {
    throw new LeagueError("That team doesn't exist.");
  }
  db.prepare("UPDATE users SET name = ?, favourite_team_id = ? WHERE id = ?").run(name, teamId, userId);
}

export function changePassword(db: DatabaseSync, userId: number, current: unknown, next: unknown): void {
  const r = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId);
  if (!r || !verifyPassword(String(current ?? ""), String(r.password_hash))) {
    throw new LeagueError("Your current password is not correct.");
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(validPassword(next)), userId);
}

// ---------------------------------------------------------------------------
// User management by the admin (create / update / reset password / delete)
// ---------------------------------------------------------------------------

function assertAdmin(acting: User) {
  if (acting.role !== "admin") throw new LeagueError("Only the admin can manage users.");
}

/** A non-admin account the admin may manage. */
function managedUser(db: DatabaseSync, userId: number): User {
  const target = getUser(db, userId);
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

function parseTeam(db: DatabaseSync, v: unknown): number | null {
  const teamId = optionalId(v);
  if (teamId != null && !db.prepare("SELECT 1 FROM teams WHERE id = ?").get(teamId)) {
    throw new LeagueError("That team doesn't exist.");
  }
  return teamId;
}

export type ManagedUserInput = { username: unknown; name?: unknown; role?: unknown; favouriteTeamId?: unknown };

/** The admin adds an account (fan or official) and sets its first password. */
export function adminCreateUser(db: DatabaseSync, acting: User, input: ManagedUserInput & { password: unknown }): User {
  assertAdmin(acting);
  const role = parseManagedRole(input.role);
  const user = signUp(db, { username: input.username, name: input.name, password: input.password, favouriteTeamId: input.favouriteTeamId });
  if (role !== "fan") db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, user.id);
  return getUser(db, user.id)!;
}

/** The admin edits an account's username, display name, role and favourite team. */
export function adminUpdateUser(db: DatabaseSync, acting: User, userId: number, input: ManagedUserInput): User {
  assertAdmin(acting);
  const target = managedUser(db, userId);
  const username = validUsername(input.username);
  if (db.prepare("SELECT 1 FROM users WHERE username = ? AND id <> ?").get(username, userId)) {
    throw new LeagueError(`The username "${username}" is taken.`);
  }
  const name = cleanText(input.name) ? requiredText(input.name, "Name", 60) : username;
  const role = parseManagedRole(input.role);
  const teamId = parseTeam(db, input.favouriteTeamId);
  db.prepare("UPDATE users SET username = ?, name = ?, role = ?, favourite_team_id = ? WHERE id = ?")
    .run(username, name, role, teamId, userId);
  // Losing official access takes effect straight away.
  if (target.role === "official" && role === "fan") db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  return getUser(db, userId)!;
}

/** The admin sets a new password for an account (e.g. it was forgotten). The user is signed out everywhere. */
export function adminResetPassword(db: DatabaseSync, acting: User, userId: number, password: unknown): User {
  assertAdmin(acting);
  const target = managedUser(db, userId);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(validPassword(password)), userId);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  return target;
}

/** The admin removes an account; its sign-ins end with it. */
export function adminDeleteUser(db: DatabaseSync, acting: User, userId: number): User {
  assertAdmin(acting);
  const target = managedUser(db, userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId); // sessions cascade
  return target;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Creates a session and returns the raw token for the cookie (only its hash is stored). */
export function createSession(db: DatabaseSync, userId: number, ttlSeconds = SESSION_TTL_SECONDS): string {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Math.floor(Date.now() / 1000)); // tidy up
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, expires);
  return token;
}

export function sessionUser(db: DatabaseSync, token: string | undefined): User | null {
  if (!token) return null;
  const r = db
    .prepare(
      `SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .get(sha256(token));
  if (!r) return null;
  if (Number(r.expires_at) < Date.now() / 1000) {
    deleteSession(db, token);
    return null;
  }
  return toUser(r);
}

export function deleteSession(db: DatabaseSync, token: string | undefined): void {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}
