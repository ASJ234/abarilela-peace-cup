import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";

const COOKIE = "apc_session";
const TTL_SECONDS = 12 * 60 * 60; // 12 hours

let warned = false;
function adminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (pw) return pw;
  if (!warned) {
    console.warn('⚠  ADMIN_PASSWORD is not set; the official password is "admin". Set it in .env.local before going live.');
    warned = true;
  }
  return "admin";
}

// Sessions are signed with a key derived from the password, so changing the
// password signs every official out.
function signingKey(): string {
  return process.env.SESSION_SECRET || `apc-session:${adminPassword()}`;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", signingKey()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function isOfficial(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now() / 1000;
}

/** Returns true and sets the session cookie if the password is right. */
export async function signIn(password: string): Promise<boolean> {
  if (!safeEqual(password, adminPassword())) return false;
  const exp = String(Math.floor(Date.now() / 1000) + TTL_SECONDS);
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: TTL_SECONDS,
  });
  return true;
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
