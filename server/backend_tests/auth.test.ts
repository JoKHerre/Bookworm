import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import type { Server } from "node:http";
import {
  assertTestDatabaseUrl,
  cookieParser,
  eq,
  express,
} from "./test-utils.ts";

assertTestDatabaseUrl();

const [
  { db, pool },
  { sessions, users },
  { hashPassword, verifyPassword },
  { loadSession },
  { authRouter },
] = await Promise.all([
  import("../src/db/index.ts"),
  import("../src/db/schema.ts"),
  import("../src/auth/password.ts"),
  import("../src/auth/middleware.ts"),
  import("../src/routes/auth.ts"),
]);

//https://xkcd.com/936/
const PASSWORD = "correct-horse-battery";
const createdEmails = new Set<string>();
let emailCounter = 0;
let server: Server;
let baseUrl: string;

function uniqueEmail() {
  emailCounter += 1;
  const email = `auth-test-${process.pid}-${Date.now()}-${emailCounter}@example.test`;
  createdEmails.add(email);
  return email;
}

async function post(path: string, body: unknown, token?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("cookie", `session=${token}`);
  return fetch(`${baseUrl}/api/auth${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function me(token?: string) {
  const headers = new Headers();
  if (token) headers.set("cookie", `session=${token}`);
  return fetch(`${baseUrl}/api/auth/me`, { headers });
}

// pull the session token out of a Set-Cookie header (empty string if cleared)
function sessionToken(res: globalThis.Response): string {
  const header = res.headers
    .getSetCookie()
    .find((c) => c.startsWith("session="));
  assert.ok(header, "Expected a session Set-Cookie header");
  return header.split(";")[0]!.slice("session=".length);
}

async function userByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

async function register(email = uniqueEmail(), password = PASSWORD) {
  const res = await post("/register", { email, password });
  assert.equal(res.status, 201);
  return { email, token: sessionToken(res) };
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSession);
  app.use("/api/auth", authRouter);
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
      // sessions cascade-delete with the user
      for (const email of createdEmails) {
        await db.delete(users).where(eq(users.email, email));
      }
    } finally {
      await pool.end();
    }
  }
});

// ---------- ACC-01: registration ----------

test("ACC-01-T-6 registers a new user and stores only a password hash", async () => {
  const email = uniqueEmail();
  const res = await post("/register", { email, password: PASSWORD });

  assert.equal(res.status, 201);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.email, email);
  assert.equal(typeof body.id, "number");
  assert.equal("passwordHash" in body, false);
  assert.equal("password" in body, false);

  const user = await userByEmail(email);
  assert.ok(user, "Expected the user row to exist");
  assert.notEqual(user.passwordHash, PASSWORD);
  assert.ok(!user.passwordHash.includes(PASSWORD));
  assert.ok(await verifyPassword(PASSWORD, user.passwordHash));
});

test("ACC-01-T-6 normalizes email case and whitespace", async () => {
  const email = uniqueEmail();
  const res = await post("/register", {
    email: `  ${email.toUpperCase()}  `,
    password: PASSWORD,
  });

  assert.equal(res.status, 201);
  assert.ok(await userByEmail(email));
});

test("ACC-01-T-6 starts a logged-in session after registering", async () => {
  const { token } = await register();
  const res = await me(token);
  assert.equal(res.status, 200);
});

test("ACC-01-T-6 rejects invalid registration input with 400 and creates no user", async () => {
  const email = uniqueEmail();
  const cases: { name: string; body: unknown; error?: string }[] = [
    {
      name: "malformed email",
      body: { email: "not-an-email", password: PASSWORD },
      error: "Enter a valid email address",
    },
    {
      name: "short password",
      body: { email, password: "short" },
      error: "Password must be at least 8 characters",
    },
    {
      name: "too-long password",
      body: { email, password: "a".repeat(201) },
      error: "Password is too long",
    },
    { name: "missing password", body: { email } },
    { name: "missing email", body: { password: PASSWORD } },
    { name: "empty body", body: {} },
    { name: "non-string fields", body: { email: 1, password: 2 } },
  ];

  for (const { name, body, error } of cases) {
    const res = await post("/register", body);
    assert.equal(res.status, 400, name);
    const json = (await res.json()) as { error: string };
    assert.equal(typeof json.error, "string", name);
    if (error) assert.equal(json.error, error, name);
    assert.equal(
      res.headers.getSetCookie().length,
      0,
      `${name}: no session cookie`,
    );
  }

  assert.equal(await userByEmail(email), undefined);
});

test("ACC-01-T-6 rejects a duplicate email with 409 and keeps the original account", async () => {
  const { email } = await register();
  const original = await userByEmail(email);

  const res = await post("/register", {
    email: email.toUpperCase(),
    password: "a-different-password",
  });

  assert.equal(res.status, 409);
  assert.equal(res.headers.getSetCookie().length, 0);

  const after = await userByEmail(email);
  assert.equal(after?.id, original?.id);
  assert.equal(after?.passwordHash, original?.passwordHash);
});

test("ACC-01-T-6 hashes passwords with a per-user salt", async () => {
  const a = await hashPassword(PASSWORD);
  const b = await hashPassword(PASSWORD);

  assert.notEqual(a, b);
  assert.ok(await verifyPassword(PASSWORD, a));
  assert.ok(await verifyPassword(PASSWORD, b));
  assert.equal(await verifyPassword("wrong-password", a), false);
  assert.equal(await verifyPassword(PASSWORD, "garbage"), false);
  assert.equal(await verifyPassword(PASSWORD, ""), false);
});

// ---------- ACC-02: login ----------

test("ACC-02-T-7 logs in with valid credentials and sets a session cookie", async () => {
  const { email } = await register();

  const res = await post("/login", { email, password: PASSWORD });
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.email, email);
  assert.equal("passwordHash" in body, false);

  const cookie = res.headers
    .getSetCookie()
    .find((c) => c.startsWith("session="));
  assert.ok(cookie);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);

  assert.equal((await me(sessionToken(res))).status, 200);
});

test("ACC-02-T-7 login is case-insensitive on email", async () => {
  const { email } = await register();
  const res = await post("/login", {
    email: email.toUpperCase(),
    password: PASSWORD,
  });
  assert.equal(res.status, 200);
});

test("ACC-02-T-7 rejects an incorrect password with 401", async () => {
  const { email } = await register();

  const res = await post("/login", { email, password: "wrong-password" });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Incorrect email or password" });
  assert.equal(res.headers.getSetCookie().length, 0);
});

test("ACC-02-T-7 rejects an unknown email with the same error as a wrong password", async () => {
  const { email } = await register();
  const wrongPassword = await post("/login", {
    email,
    password: "nope-nope-nope",
  });
  const unknownEmail = await post("/login", {
    email: uniqueEmail(),
    password: PASSWORD,
  });

  assert.equal(unknownEmail.status, 401);
  assert.equal(unknownEmail.headers.getSetCookie().length, 0);
  assert.deepEqual(await unknownEmail.json(), await wrongPassword.json());
});

test("ACC-02-T-7 rejects malformed login bodies with 401", async () => {
  for (const body of [
    {},
    { email: "nope", password: PASSWORD },
    { email: 1 },
  ]) {
    const res = await post("/login", body);
    assert.equal(res.status, 401);
    assert.equal(res.headers.getSetCookie().length, 0);
  }
});

test("ACC-02-T-7 session persists across multiple requests and /me returns the user", async () => {
  const { email, token } = await register();

  for (let i = 0; i < 3; i += 1) {
    const res = await me(token);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { email: string };
    assert.equal(body.email, email);
  }
});

test("ACC-02-T-7 /me rejects requests with no or an invalid session", async () => {
  assert.equal((await me()).status, 401);

  const res = await me("not-a-real-token");
  assert.equal(res.status, 401);
  // the stale cookie is cleared
  assert.equal(sessionToken(res), "");
});

test("ACC-02-T-7 an expired session is rejected and deleted", async () => {
  const { token } = await register();
  const { hash } = await import("node:crypto");
  const id = hash("sha256", token);

  await db
    .update(sessions)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(sessions.id, id));

  assert.equal((await me(token)).status, 401);
  const rows = await db.select().from(sessions).where(eq(sessions.id, id));
  assert.equal(rows.length, 0);
});

test("ACC-02-T-7 logging in while already logged in replaces the old session", async () => {
  const { email, token: oldToken } = await register();

  const res = await post("/login", { email, password: PASSWORD }, oldToken);
  assert.equal(res.status, 200);
  const newToken = sessionToken(res);

  assert.notEqual(newToken, oldToken);
  assert.equal((await me(oldToken)).status, 401);
  assert.equal((await me(newToken)).status, 200);
});

// ---------- ACC-03: logout ----------

test("ACC-03-T-4 logout invalidates the session and clears the cookie", async () => {
  const { token } = await register();
  assert.equal((await me(token)).status, 200);

  const res = await post("/logout", {}, token);
  assert.equal(res.status, 204);
  assert.equal(sessionToken(res), "");

  assert.equal((await me(token)).status, 401);
});

test("ACC-03-T-4 logout only ends the current session, not other users'", async () => {
  const a = await register();
  const b = await register();

  await post("/logout", {}, a.token);

  assert.equal((await me(a.token)).status, 401);
  assert.equal((await me(b.token)).status, 200);
});

test("ACC-03-T-4 logout without a session still succeeds", async () => {
  const res = await post("/logout", {});
  assert.equal(res.status, 204);
});

test("ACC-03-T-4 can log back in after logging out", async () => {
  const { email, token } = await register();
  await post("/logout", {}, token);

  const res = await post("/login", { email, password: PASSWORD });
  assert.equal(res.status, 200);
  assert.equal((await me(sessionToken(res))).status, 200);
});
