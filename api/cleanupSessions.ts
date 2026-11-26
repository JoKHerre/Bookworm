import { attachDatabasePool } from "@vercel/functions";
import { handleSchedule } from "@vercel/schedules";
import { pool } from "../server/src/db/index.ts";
import { deleteExpiredSessions } from "../server/src/db/session.ts";

attachDatabasePool(pool);

// The schedule/v1beta trigger makes this a private function on Vercel.
export const POST = handleSchedule(async () => {
  await deleteExpiredSessions();
});
