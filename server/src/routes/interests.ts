import { Router, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { userGenres } from "../db/schema.ts";
import { requireAuth } from "../auth/middleware.ts";
import type { ApiError } from "../../../shared/api.ts";
import {
  saveInterestsBody,
  sortGenres,
  type InterestsResponse,
} from "../../../shared/interests.ts";

export const interestsRouter: Router = Router();
interestsRouter.use(requireAuth);

// GET /api/interests: the genres the signed-in user likes
interestsRouter.get("/", async (_req, res: Response<InterestsResponse>) => {
  const rows = await db
    .select({ genre: userGenres.genre })
    .from(userGenres)
    .where(eq(userGenres.userId, res.locals.user!.id));

  res.json({ genres: sortGenres(rows.map(({ genre }) => genre)) });
});

// PUT /api/interests: replace the genres the signed-in user likes
interestsRouter.put(
  "/",
  async (req, res: Response<InterestsResponse | ApiError>) => {
    const parsed = saveInterestsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid genres" });
      return;
    }

    const userId = res.locals.user!.id;
    const genres = sortGenres(parsed.data.genres);

    await db.transaction(async (tx) => {
      await tx.delete(userGenres).where(eq(userGenres.userId, userId));
      if (genres.length > 0) {
        await tx
          .insert(userGenres)
          .values(genres.map((genre) => ({ userId, genre })));
      }
    });

    res.json({ genres });
  },
);
