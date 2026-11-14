import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
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
    unique("saved_books_user_id_unique").on(table.id, table.userId),
  ],
);

// table for user-created collections of books
export const collections = pgTable(
  "collections",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("collections_user_id_unique").on(table.id, table.userId),
    // Drizzle Kit introspects every key in an expression index as an expression.
    uniqueIndex("collections_user_name_unique").on(
      sql`user_id`,
      sql`lower(name)`,
    ),
    check(
      "collections_name_valid",
      sql`char_length(${table.name}) BETWEEN 1 AND 100 AND ${table.name} !~ '^[[:space:]]|[[:space:]]$'`,
    ),
  ],
);

// table for saved books that are in a user's collection(s)
// one book can appear in many collections, but only once per
export const collectionBooks = pgTable(
  "collection_books",
  {
    collectionId: integer("collection_id").notNull(),
    savedBookId: integer("saved_book_id").notNull(),
    userId: integer("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.savedBookId] }),
    foreignKey({
      name: "collection_books_collection_owner_fk",
      columns: [table.collectionId, table.userId],
      foreignColumns: [collections.id, collections.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "collection_books_saved_book_owner_fk",
      columns: [table.savedBookId, table.userId],
      foreignColumns: [savedBooks.id, savedBooks.userId],
    }).onDelete("cascade"),
    index("collection_books_user_saved_book_idx").on(
      table.userId,
      table.savedBookId,
    ),
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
export type Collection = typeof collections.$inferSelect;
export type CollectionBook = typeof collectionBooks.$inferSelect;
