import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { LeagueError, type Row, cleanText, optionalId, requiredText } from "./validate";

export type Role = "fan" | "official" | "admin";
export const ROLE_LABEL: Record<Role, string> = { fan: "Fan", official: "Official", admin: "Admin" };

export type User = {
  id: number;
  email: string;
  name: string;
  role: Role;
  favouriteTeamId: number | null;
  createdAt: string;
};

export const canManageLeague = (u: Pick<User, "role"> | null | undefined) => u?.role === "official" || u?.role === "admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function toUser(r: Row): User {
  return {
    id: Number(r.id),
    email: String(r.email),
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

function validEmail(v: unknown): string {
  const email = cleanText(v).toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) throw new LeagueError("Enter a valid email address.");
  return email;
}

function validPassword(v: unknown): string {
  const pw = String(v ?? "");
  if (pw.length < MIN_PASSWORD) throw new LeagueError(`Use a password of at least ${MIN_PASSWORD} characters.`);
  if (pw.length > 200) throw new LeagueError("That password is too long.");
  return pw;
}

const isAdminEmail = (email: string, adminEmails: string[]) => adminEmails.includes(email.toLowerCase());

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

/** New accounts are fans, except emails listed as admin (ADMIN_EMAIL). */
export function signUp(
  db: DatabaseSync,
  input: { name: unknown; email: unknown; password: unknown; favouriteTeamId?: unknown },
  adminEmails: string[] = [],
): User {
  const name = requiredText(input.name, "Name", 60);
  const email = validEmail(input.email);
  const password = validPassword(input.password);
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    throw new LeagueError("An account with this email already exists. Sign in instead.");
  }
  const teamId = optionalId(input.favouriteTeamId);
  if (teamId != null && !db.prepare("SELECT 1 FROM teams WHERE id = ?").get(teamId)) {
    throw new LeagueError("That team doesn't exist.");
  }
  const role: Role = isAdminEmail(email, adminEmails) ? "admin" : "fan";
  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (email, name, password_hash, role, favourite_team_id) VALUES (?, ?, ?, ?, ?)")
    .run(email, name, hashPassword(password), role, teamId);
  return getUser(db, Number(lastInsertRowid))!;
}

/**
 * Checks email + password. Returns the user, or null if either is wrong
 * (deliberately not saying which). An ADMIN_EMAIL account is promoted on sign-in.
 */
export function authenticate(db: DatabaseSync, emailRaw: unknown, password: unknown, adminEmails: string[] = []): User | null {
  const email = cleanText(emailRaw).toLowerCase();
  const r = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!r) {
    hashPassword(String(password ?? "")); // spend similar time so response speed doesn't reveal which emails exist
    return null;
  }
  if (!verifyPassword(String(password ?? ""), String(r.password_hash))) return null;
  if (isAdminEmail(email, adminEmails) && r.role !== "admin") {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(Number(r.id));
  }
  return getUser(db, Number(r.id));
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

/** Admins promote fans to officials (or back). The admin role itself only comes from ADMIN_EMAIL. */
export function setRole(db: DatabaseSync, acting: User, userId: number, roleRaw: unknown): User {
  if (acting.role !== "admin") throw new LeagueError("Only the admin can change roles.");
  const role = String(roleRaw) as Role;
  if (role !== "fan" && role !== "official") throw new LeagueError("Choose Fan or Official.");
  const target = getUser(db, userId);
  if (!target) throw new LeagueError("User not found.");
  if (target.role === "admin") throw new LeagueError("The admin's role can't be changed here.");
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
  if (role === "fan") db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId); // sign out demoted officials
  return getUser(db, userId)!;
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
