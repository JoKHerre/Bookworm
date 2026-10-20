import type { Response } from "express";

export const SESSION_COOKIE = "session";

const securityOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function setSessionCookie(
  res: Response,
  token: string,
  expiresAt: Date,
) {
  res.cookie(SESSION_COOKIE, token, { ...securityOptions, expires: expiresAt });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, securityOptions);
}
