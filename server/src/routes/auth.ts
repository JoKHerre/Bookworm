import { Router, type Response } from 'express';
// import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { treeifyError, z } from 'zod';
import { db } from '../db/index.ts';
import { users, type User } from '../db/schema.ts';
import { createSession, generateSessionToken, invalidateSession } from '../db/session.ts';
import { clearSessionCookie, setSessionCookie } from '../auth/cookie.ts';
import { requireAuth } from '../auth/middleware.ts';
import { flattenError } from 'zod/v4/core';
import { hash } from 'node:crypto';



export const authRouter: Router = Router();

const credentials = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(200),
}
);

async function startSession(res: Response, userId: number) {
  const token = generateSessionToken();
  const session = await createSession(token, userId);
  setSessionCookie(res, token, session.expiresAt);
}


authRouter.post('/register', async (req, res) => {
  const parse = credentials.safeParse(req.body);
  if (!parse.success) {
    const flatError = flattenError(parse.error);
    res.status(400).json({
      emailError: flatError.fieldErrors.email?.[0],
      passwordError: flatError.fieldErrors.password?.[0]
    })
    return;
  }

  const { email, password } = parse.data;

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: hash('sha256', password)})
    .onConflictDoNothing({target: users.email})
    .returning()

  if (!user) {
    res.status(409).json({error: "An account with this email already exists"});
  }

  await startSession(res, user!.id);
  res.status(201).json(user);
})
