import type { Session } from '../db/schema.ts';
import type { SessionUser } from '../db/session.ts';

declare global {
  namespace Express {
    interface Locals {
      user: SessionUser | null;
      session: Session | null;
    }
  }
}

export {};
