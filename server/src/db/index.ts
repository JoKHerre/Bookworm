import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.ts";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });
