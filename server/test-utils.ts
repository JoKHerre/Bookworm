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
