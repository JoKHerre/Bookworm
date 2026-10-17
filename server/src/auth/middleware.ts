import type { NextFunction, Request, Response } from 'express';
import { validateSessionToken } from '../db/session.ts';
import { SESSION_COOKIE, clearSessionCookie, setSessionCookie } from './cookie.ts';


//runs on every request to see if logged in
export async function loadSession(req: Request, res: Response, next: NextFunction) {
  res.locals.user = null;
  res.locals.session = null;

  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string') return next();

  const { session, user } = await validateSessionToken(token);
  if (session) {
    // extend session if validateSessionToken extended session
    setSessionCookie(res, token, session.expiresAt);
  } else {
    clearSessionCookie(res);
  }

  res.locals.user = user;
  res.locals.session = session;
  next();
}

// runs on any route that needs you to be logged in
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!res.locals.user) {
    res.status(401).json({ error: 'Not logged in' });
    return;
  }
  next();
}
