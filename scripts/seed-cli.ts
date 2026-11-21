/** `npm run seed [-- --replace]`: see scripts/seed.ts and scripts/seed-copy.ts. */
import { connect } from "../src/lib/pg";
import { assertSchema } from "../src/lib/schema";
import { seedFast } from "./seed-copy";

const { db, close } = connect();
const started = Date.now();
assertSchema(db)
  .then(() => seedFast(db, { replace: process.argv.includes("--replace") }))
  .then(() => console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`))
  .finally(() => close());
