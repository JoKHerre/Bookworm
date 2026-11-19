import assert from "node:assert/strict";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import type { Express } from "express";

export { eq };

export function assertTestDatabaseUrl(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must point to the bookworm_test database.");
  }

  let databaseName: string;
  try {
    databaseName = new URL(databaseUrl).pathname.slice(1);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (databaseName !== "bookworm_test") {
    throw new Error(
      `Refusing to run tests against '${databaseName}'. Use bookworm_test.`,
    );
  }
}

let bookCounter = 0;

export function createTestBookKey() {
  bookCounter += 1;
  return `/works/OL${Date.now()}${process.pid}${bookCounter}W`;
}

// Serve the app on a random local port. Call close() when the tests finish.
export async function startTestServer(app: Express) {
  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (!server.listening) return resolve();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
