/** `npm run seed [-- --replace]`: see scripts/seed.ts. */
import { connect } from "../src/lib/pg";
import { seedDemo } from "./seed";

const { db, close } = connect();
seedDemo(db, { replace: process.argv.includes("--replace") }).finally(() => close());
