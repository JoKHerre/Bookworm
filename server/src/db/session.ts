import { type Session, users } from "./schema.ts";
import { db } from "./index.ts";
import { sessions } from "./schema.ts";
import { randomBytes, hash } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { PublicUser } from "../../../shared/auth.ts";

// 20 random bytes = 160 bits of randomness, encoded URL/cookie-safe.
export function generateSessionToken(): string {
  return randomBytes(20).toString("base64url");
}

export async function createSession(
  token: string,
  userId: number,
): Promise<Session> {
  const sessionId = hash("sha256", token);
  const session: Session = {
    id: sessionId,
    userId,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // ms_in_seconds * seconds_in_minute * minutes_in_hour * hours_in_day * 30 = 30 days
  };
  await db.insert(sessions).values(session);
  return session;
}

export async function validateSessionToken(
  token: string,
): Promise<SessionValidationResult> {
  const sessionId = hash("sha256", token);
  const result = await db
    .select({ user: { id: users.id, email: users.email }, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId));
  if (result.length < 1) {
    return { session: null, user: null };
  }
  const { user, session } = result[0]!;

  if (Date.now() >= session.expiresAt.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return { session: null, user: null };
  }
  // if we have less than 15 days then reset session to expire 30 days from now
  if (Date.now() >= session.expiresAt.getTime() - 1000 * 60 * 60 * 24 * 15) {
    session.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    await db
      .update(sessions)
      .set({ expiresAt: session.expiresAt })
      .where(eq(sessions.id, session.id));
  }
  return { session, user };
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export type SessionValidationResult =
  { session: Session; user: PublicUser } | { session: null; user: null };
