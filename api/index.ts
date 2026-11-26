import { attachDatabasePool } from "@vercel/functions";
import { createApp } from "../server/src/app.ts";
import { pool } from "../server/src/db/index.ts";

// Vercel can suspend a function between requests; release idle DB connections.
attachDatabasePool(pool);

// The local entry point starts a listener and timer. Functions only need the app.
export default createApp();
