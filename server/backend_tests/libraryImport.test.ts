import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import type { Server } from "node:http";
import {
  assertTestDatabaseUrl,
  cookieParser,
  createTestBookKey,
  eq,
  express,
} from "./test-utils.ts";

assertTestDatabaseUrl();

const [
  { db, pool },
  { savedBooks, users },
  { createSession, generateSessionToken },
  { loadSession },
  { libraryRouter },
] = await Promise.all([
  import("../src/db/index.ts"),
  import("../src/db/schema.ts"),
  import("../src/db/session.ts"),
  import("../src/auth/middleware.ts"),
  import("../src/routes/library.ts"),
]);

const createdUserIds = new Set<number>();
let emailCounter = 0;
let server: Server;
let baseUrl: string;

async function createSignedInUser() {
  emailCounter += 1;
  const email = `import-test-${process.pid}-${Date.now()}-${emailCounter}@example.test`;
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "test-only-password-hash" })
    .returning({ id: users.id });

  assert.ok(user, "Expected PostgreSQL to create a test user");
  createdUserIds.add(user.id);

  const token = generateSessionToken();
  await createSession(token, user.id);
  return { id: user.id, token };
}

// POST /api/library/import, with a session cookie when a token is given
async function postImport(body: unknown, token?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("cookie", `session=${token}`);

  return fetch(`${baseUrl}/api/library/import`, {
    method: "POST",
    headers,
    body: JSON.stringify(body) ?? "",
  });
}

async function rowsForBook(bookKey: string) {
  return db.select().from(savedBooks).where(eq(savedBooks.bookKey, bookKey));
}

async function rowsForUser(userId: number) {
  return db.select().from(savedBooks).where(eq(savedBooks.userId, userId));
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSession);
  app.use("/api/library", libraryRouter);
  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    res.status(500).json({ error: "Internal server error" });
  });

  server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  try {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  } finally {
    try {
      for (const userId of createdUserIds) {
        await db.delete(users).where(eq(users.id, userId));
      }
    } finally {
      await pool.end();
    }
  }
});

test("IMP-01-T-5 rejects an unauthenticated import", async () => {
  const bookKey = createTestBookKey();
  const response = await postImport({ bookKeys: [bookKey] });

  assert.equal(response.status, 401);
  assert.deepEqual(await rowsForBook(bookKey), []);
});

test("IMP-01-T-5 imports books for the signed-in user", async () => {
  const user = await createSignedInUser();
  const keys = [createTestBookKey(), createTestBookKey()];

  const response = await postImport({ bookKeys: keys }, user.token);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { added: 2, alreadySaved: 0 });
  const rows = await rowsForUser(user.id);
  assert.deepEqual(rows.map((r) => r.bookKey).sort(), [...keys].sort());
  for (const row of rows) assert.equal(row.readingStatus, "to_be_read");
});

test("IMP-01-T-5 skips books already in the library", async () => {
  const user = await createSignedInUser();
  const [existing, fresh] = [createTestBookKey(), createTestBookKey()];
  await db.insert(savedBooks).values({
    userId: user.id,
    bookKey: existing,
    readingStatus: "finished",
  });

  const response = await postImport(
    { bookKeys: [existing, fresh] },
    user.token,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { added: 1, alreadySaved: 1 });
  const rows = await rowsForUser(user.id);
  assert.equal(rows.length, 2);
  // the book the user already had keeps its reading status
  assert.equal(
    rows.find((r) => r.bookKey === existing)?.readingStatus,
    "finished",
  );
});

test("IMP-01-T-5 counts repeated keys once", async () => {
  const user = await createSignedInUser();
  const key = createTestBookKey();

  const response = await postImport({ bookKeys: [key, key, key] }, user.token);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { added: 1, alreadySaved: 0 });
  assert.equal((await rowsForBook(key)).length, 1);
});

test("IMP-01-T-5 allows different users to import the same book", async () => {
  const [first, second] = [
    await createSignedInUser(),
    await createSignedInUser(),
  ];
  const key = createTestBookKey();

  assert.equal(
    (await postImport({ bookKeys: [key] }, first.token)).status,
    200,
  );
  const response = await postImport({ bookKeys: [key] }, second.token);

  assert.deepEqual(await response.json(), { added: 1, alreadySaved: 0 });
  const owners = (await rowsForBook(key)).map((r) => r.userId).sort();
  assert.deepEqual(owners, [first.id, second.id].sort());
});

test("IMP-01-T-5 rejects invalid bodies and saves nothing", async () => {
  const user = await createSignedInUser();
  const good = createTestBookKey();
  const tooMany = Array.from({ length: 501 }, () => createTestBookKey());

  const bodies: unknown[] = [
    [],
    {},
    { bookKeys: [] },
    { bookKeys: "not a list" },
    { bookKeys: tooMany },
    { bookKeys: [good, "/books/OL1M"] },
    { bookKeys: [good, 42] },
    { bookKeys: [good], extra: true },
  ];

  for (const body of bodies) {
    const response = await postImport(body, user.token);
    assert.equal(response.status, 400, JSON.stringify(body)?.slice(0, 80));
    assert.deepEqual(await response.json(), { error: "Invalid import" });
  }
  assert.deepEqual(await rowsForUser(user.id), []);
  assert.deepEqual(await rowsForBook(good), []);
});

test("IMP-01-T-5 does not accept a client-supplied user ID", async () => {
  const [user, other] = [
    await createSignedInUser(),
    await createSignedInUser(),
  ];
  const key = createTestBookKey();

  const response = await postImport(
    { bookKeys: [key], userId: other.id },
    user.token,
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await rowsForUser(user.id), []);
  assert.deepEqual(await rowsForUser(other.id), []);
});
