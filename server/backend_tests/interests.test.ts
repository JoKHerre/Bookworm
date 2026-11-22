import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { assertTestDatabaseUrl, eq, startTestServer } from "./test-utils.ts";

assertTestDatabaseUrl();

const [
  { db, pool },
  { users },
  { createSession, generateSessionToken },
  { createApp },
] = await Promise.all([
  import("../src/db/index.ts"),
  import("../src/db/schema.ts"),
  import("../src/db/session.ts"),
  import("../src/app.ts"),
]);

const createdUserIds = new Set<number>();
let emailCounter = 0;
let closeServer: () => Promise<void>;
let baseUrl: string;

async function createSignedInUser() {
  emailCounter += 1;
  const email = `interests-test-${process.pid}-${Date.now()}-${emailCounter}@example.test`;
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: "test-only-password-hash" })
    .returning({ id: users.id });

  assert.ok(user, "Expected PostgreSQL to create a test user");
  createdUserIds.add(user.id);

  const token = generateSessionToken();
  await createSession(token, user.id);
  return token;
}

function headersFor(token?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("cookie", `session=${token}`);
  return headers;
}

function getInterests(token?: string) {
  return fetch(`${baseUrl}/api/interests`, { headers: headersFor(token) });
}

function putInterests(body: unknown, token?: string) {
  return fetch(`${baseUrl}/api/interests`, {
    method: "PUT",
    headers: headersFor(token),
    body: JSON.stringify(body),
  });
}

async function storedGenres(token: string) {
  const response = await getInterests(token);
  assert.equal(response.status, 200);
  return ((await response.json()) as { genres: string[] }).genres;
}

before(async () => {
  ({ baseUrl, close: closeServer } = await startTestServer(createApp()));
});

after(async () => {
  try {
    await closeServer();
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

test("DIS-01-T-1 returns no genres before any are picked", async () => {
  const token = await createSignedInUser();
  assert.deepEqual(await storedGenres(token), []);
});

test("DIS-01-T-1 replaces genres and returns them in order", async () => {
  const token = await createSignedInUser();

  const response = await putInterests(
    { genres: ["Poetry", "Fantasy", "Mystery", "Fantasy"] },
    token,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    genres: ["Fantasy", "Mystery", "Poetry"],
  });
  assert.deepEqual(await storedGenres(token), ["Fantasy", "Mystery", "Poetry"]);

  await putInterests({ genres: ["Horror"] }, token);
  assert.deepEqual(await storedGenres(token), ["Horror"]);
});

test("DIS-01-T-1 clears genres with an empty list", async () => {
  const token = await createSignedInUser();
  await putInterests({ genres: ["Fantasy", "Sci-fi"] }, token);

  const response = await putInterests({ genres: [] }, token);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { genres: [] });
  assert.deepEqual(await storedGenres(token), []);
});

test("DIS-01-T-1 keeps each user's genres separate", async () => {
  const first = await createSignedInUser();
  const second = await createSignedInUser();
  await putInterests({ genres: ["Fantasy"] }, first);
  await putInterests({ genres: ["History", "Biography"] }, second);
  await putInterests({ genres: [] }, first);

  assert.deepEqual(await storedGenres(first), []);
  assert.deepEqual(await storedGenres(second), ["History", "Biography"]);
});

test("DIS-01-T-1 overlapping saves don't conflict", async () => {
  const lists = [
    ["Fantasy", "Mystery"],
    ["Fantasy", "Mystery", "Romance"],
    ["Fantasy", "Horror"],
  ];
  for (let round = 0; round < 10; round++) {
    const token = await createSignedInUser();
    await putInterests({ genres: ["Fantasy"] }, token);

    const responses = await Promise.all(
      lists.map((genres) => putInterests({ genres }, token)),
    );
    assert.deepEqual(
      responses.map(({ status }) => status),
      [200, 200, 200],
    );
    const stored = await storedGenres(token);
    assert.ok(
      lists.some((genres) => JSON.stringify(genres) === JSON.stringify(stored)),
      `stored ${JSON.stringify(stored)}`,
    );
  }
});

test("DIS-01-T-1 rejects invalid genres without changing them", async () => {
  const token = await createSignedInUser();
  await putInterests({ genres: ["Romance"] }, token);

  for (const body of [
    { genres: ["Romance", "Cooking"] },
    { genres: "Fantasy" },
    {},
    { genres: ["Fantasy"], userId: 1 },
  ]) {
    const response = await putInterests(body, token);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.deepEqual(await response.json(), { error: "Invalid genres" });
  }
  assert.deepEqual(await storedGenres(token), ["Romance"]);
});

test("DIS-01-T-1 requires login", async () => {
  assert.equal((await getInterests()).status, 401);
  assert.equal((await putInterests({ genres: ["Fantasy"] })).status, 401);
});
