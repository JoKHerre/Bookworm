import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cookieParser from "cookie-parser";
import { sql } from "drizzle-orm";
import { db } from "./db/index.ts";
import { loadSession } from "./auth/middleware.ts";
import { authRouter } from "./routes/auth.ts";
import { booksRouter } from "./routes/books.ts";
import { collectionsRouter } from "./routes/collections.ts";
import { libraryRouter } from "./routes/library.ts";
import { ratingsRouter } from "./routes/ratings.ts";

// The API with all of its middleware and routes, but not listening. Tests
// mount this same app so they exercise the real route order.
export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSession);
  app.use("/api/auth", authRouter);
  app.use("/api/books", booksRouter);
  app.use("/api/library", libraryRouter);
  app.use("/api/collections", collectionsRouter);
  app.use("/api/ratings", ratingsRouter);

  app.get("/api/health", async (req: Request, res: Response) => {
    await db.execute(sql`select 1`);
    res.json({ ok: true });
  });

  // Catches anything thrown or rejected in a handler/middleware (e.g. DB down, malformed JSON) and replies with JSON.
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    const status =
      typeof (err as { status?: unknown })?.status === "number"
        ? (err as { status: number }).status
        : 500;
    if (status >= 500) console.error(err);
    res
      .status(status)
      .json({ error: status >= 500 ? "Internal server error" : "Bad request" });
  });

  return app;
}
