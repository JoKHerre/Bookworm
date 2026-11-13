import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to push the database schema.");
}
const pool = new pg.Pool({ connectionString });

try {
  // Drizzle Kit 0.31 adds foreign keys before unique constraints on existing
  // tables. prepare their referenced keys first, without changing any rows.
  for (const table of ["saved_books", "collections"] as const) {
    await pool.query(`
      DO $$
      BEGIN
        IF to_regclass('public.${table}') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = to_regclass('public.${table}')
              AND conname = '${table}_user_id_unique'
          ) THEN
          ALTER TABLE public.${table}
            ADD CONSTRAINT ${table}_user_id_unique UNIQUE (id, user_id);
        END IF;
      END $$;
    `);
  }
} finally {
  await pool.end();
}
