import { Router, type Response } from "express";
import { eq } from "drizzle-orm";
import { flattenError } from "zod";
import { db } from "../db/index.ts";
import { users, type User } from "../db/schema.ts";
import {
  createSession,
  generateSessionToken,
  invalidateSession,
} from "../db/session.ts";
import { clearSessionCookie, setSessionCookie } from "../auth/cookie.ts";
import { requireAuth } from "../auth/middleware.ts";
import { DUMMY_HASH, hashPassword, verifyPassword } from "../auth/password.ts";
import { credentials, type PublicUser } from "../../../shared/auth.ts";

export const authRouter: Router = Router();

async function startSession(res: Response, userId: number) {
  const token = generateSessionToken();
  const session = await createSession(token, userId);
  setSessionCookie(res, token, session.expiresAt);
}

function publicUser(user: Pick<User, "id" | "email">): PublicUser {
  return { id: user.id, email: user.email };
}

authRouter.post("/register", async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    const { fieldErrors } = flattenError(parsed.error);
    res.status(400).json({
      error:
        fieldErrors.email?.[0] ??
        fieldErrors.password?.[0] ??
        "Invalid email or password",
    });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: await hashPassword(password) })
    .onConflictDoNothing({ target: users.email })
    .returning();

  if (!user) {
    res
      .status(409)
      .json({ error: "An account with this email already exists" });
    return;
  }

  await startSession(res, user!.id);
  res.status(201).json(publicUser(user!));
});

authRouter.post("/login", async (req, res) => {
  const parsed = credentials.safeParse(req.body);

  const [user] = parsed.success
    ? await db.select().from(users).where(eq(users.email, parsed.data.email))
    : [];

  if (!parsed.success) {
    res.status(401).json({ error: "Incorrect email or password" });
    return;
  }

  // Verify against a dummy hash when the email is unknown so both cases take the same time.
  const passwordOk = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? (await DUMMY_HASH),
  );

  if (!user || !passwordOk) {
    res.status(401).json({
      error: "Incorrect email or password",
    });
    return;
  }

  if (res.locals.session) await invalidateSession(res.locals.session.id);

  await startSession(res, user.id);
  res.json(publicUser(user));
});

authRouter.post("/logout", async (req, res) => {
  if (res.locals.session) await invalidateSession(res.locals.session.id);
  clearSessionCookie(res);
  res.sendStatus(204);
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(res.locals.user!);
});
