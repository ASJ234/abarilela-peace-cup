/**
 * The site has exactly one admin. Run with DATABASE_URL set (it's read from .env.local):
 *   npm run admin -- <username> <password>             create the admin, or reset the admin's password
 *   npm run admin -- <username> <password> --replace   hand the admin role to another account
 *                                                       (the previous admin becomes a fan)
 * Signing in as admin lets you promote other users to official on the "Users & roles" page.
 */
import { connect } from "../src/lib/pg";
import { assertSchema } from "../src/lib/schema";
import { getAdmin, setUpAdmin } from "../src/lib/users";
import { LeagueError } from "../src/lib/validate";

const args = process.argv.slice(2);
const replace = args.includes("--replace");
const [username, password] = args.filter((a) => a !== "--replace");
if (!username || !password) {
  console.error("Usage: npm run admin -- <username> <password> [--replace]");
  process.exit(1);
}

async function main() {
  const { db, close } = connect();
  try {
    await assertSchema(db);
    const before = await getAdmin(db);
    const admin = await setUpAdmin(db, username, password, { replace });
    if (before && before.id !== admin.id) console.log(`• "${before.username}" is no longer the admin (now a fan).`);
    console.log(`✓ "${admin.username}" is the admin. Sign in with that username and the password you gave.`);
  } catch (err) {
    if (err instanceof LeagueError) {
      console.error(`✗ ${err.message}`);
      process.exitCode = 1;
    } else {
      throw err;
    }
  } finally {
    await close();
  }
}

void main();
