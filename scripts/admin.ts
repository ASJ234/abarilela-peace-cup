/**
 * The site has exactly one admin. Run on the machine where the database lives:
 *   npm run admin -- <username> <password>             create the admin, or reset the admin's password
 *   npm run admin -- <username> <password> --replace   hand the admin role to another account
 *                                                       (the previous admin becomes a fan)
 * Signing in as admin lets you promote other users to official on the "Users & roles" page.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../src/lib/schema";
import { getAdmin, setUpAdmin } from "../src/lib/users";
import { LeagueError } from "../src/lib/validate";

const args = process.argv.slice(2);
const replace = args.includes("--replace");
const [username, password] = args.filter((a) => a !== "--replace");
if (!username || !password) {
  console.error("Usage: npm run admin -- <username> <password> [--replace]");
  process.exit(1);
}

const file = process.env.DB_FILE || path.join(process.cwd(), "data", "league.db");
fs.mkdirSync(path.dirname(file), { recursive: true });
const db = new DatabaseSync(file);
migrate(db);

try {
  const before = getAdmin(db);
  const admin = setUpAdmin(db, username, password, { replace });
  if (before && before.id !== admin.id) console.log(`• "${before.username}" is no longer the admin (now a fan).`);
  console.log(`✓ "${admin.username}" is the admin. Sign in with that username and the password you gave.`);
} catch (err) {
  if (err instanceof LeagueError) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
  throw err;
}
