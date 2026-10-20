import type { PublicUser } from "../../../shared/auth.ts";
import type { Session } from "../db/schema.ts";

declare global {
  namespace Express {
    interface Locals {
      user: PublicUser | null;
      session: Session | null;
    }
  }
}

export {};
