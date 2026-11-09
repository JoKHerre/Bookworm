import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { READING_STATUSES } from "../../../shared/readingStatus.ts";

export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  //indexes userId
  (t) => [index("session_user_id_idx").on(t.userId)],
);

// define the allowed reading status values for user's saved books
export const readingStatusEnum = pgEnum("reading_status", READING_STATUSES);

export const savedBooks = pgTable(
  "saved_books",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookKey: text("book_key").notNull(),
    readingStatus: readingStatusEnum("reading_status")
      .notNull()
      .default("to_be_read"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("saved_books_user_book_unique").on(table.userId, table.bookKey),
  ],
);

// a user's 1-5 star rating of a book; independent of whether the book is saved to their library
export const bookRatings = pgTable(
  "book_ratings",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookKey: text("book_key").notNull(),
    rating: integer("rating").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("book_ratings_user_book_unique").on(
      table.userId,
      table.bookKey,
    ),
    check("book_ratings_rating_range", sql`${table.rating} BETWEEN 1 AND 5`),
  ],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SavedBook = typeof savedBooks.$inferSelect;
export type BookRating = typeof bookRatings.$inferSelect;
