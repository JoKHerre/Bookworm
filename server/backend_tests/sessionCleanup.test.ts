import assert from "node:assert/strict";
import { after, test } from "node:test";
import { assertTestDatabaseUrl, eq } from "./test-utils.ts";

assertTestDatabaseUrl();

const [{ POST }, { db, pool }, { sessions, users }] = await Promise.all([
  import("../../api/cleanupSessions.ts"),
  import("../src/db/index.ts"),
  import("../src/db/schema.ts"),
]);

after(() => pool.end());

test("scheduled cleanup deletes expired sessions and keeps active sessions", async (t) => {
  const [user] = await db
    .insert(users)
    .values({
      email: `session-cleanup-${process.pid}-${Date.now()}@example.test`,
      passwordHash: "unused-test-password-hash",
    })
    .returning({ id: users.id });
  assert.ok(user);

  // Deleting this test user also deletes its sessions.
  t.after(() => db.delete(users).where(eq(users.id, user.id)));

  const expiredId = `expired-session-${user.id}`;
  const activeId = `active-session-${user.id}`;
  await db.insert(sessions).values([
    {
      id: expiredId,
      userId: user.id,
      expiresAt: new Date(Date.now() - 60_000),
    },
    {
      id: activeId,
      userId: user.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  ]);

  // This URL is a placeholder. POST(request) below makes no network request.
  const request = new Request("https://example.test/api/cleanupSessions", {
    method: "POST",
    // Required metadata that Vercel supplies during a real scheduled run:
    // https://vercel.com/docs/schedules/handle-runs#request-headers
    headers: {
      "ce-specversion": "1.0",
      "ce-type": "com.vercel.schedule.v1beta",
      "ce-source": "/schedule/default/cleanup-sessions",
      "ce-id": "test-cleanup-run",
      "ce-vssscheduleid": "sch_session_cleanup_test",
      "ce-vssschedulename": "cleanup-sessions",
      "ce-vssnamespace": "default",
      "ce-vssscheduledat": new Date().toISOString(),
      "ce-vssschedulesource": "static",
      "ce-vssexpression": "0 * * * *",
    },
  });

  const response = await POST(request);
  assert.equal(response.status, 200);

  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, user.id));
  assert.deepEqual(
    rows.map((row) => row.id),
    [activeId],
  );
});
