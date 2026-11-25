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
import { BOOK_GENRES } from "../../../shared/books.ts";
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

// Private notes belong to a user and work, independently of My Library.
export const bookNotes = pgTable(
  "book_notes",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookKey: text("book_key").notNull(),
    content: text("content").notNull(),
    reference: text("reference"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // The notes endpoint will explicitly set this timestamp when editing.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("book_notes_user_book_idx").on(table.userId, table.bookKey),
    check(
      "book_notes_book_key_valid",
      sql`${table.bookKey} ~ '^/works/OL[0-9]+W$'`,
    ),
    check(
      "book_notes_content_valid",
      sql`char_length(${table.content}) BETWEEN 1 AND 10000 AND ${table.content} !~ '^[[:space:]]*$'`,
    ),
    check(
      "book_notes_reference_valid",
      sql`${table.reference} IS NULL OR (char_length(${table.reference}) BETWEEN 1 AND 100 AND ${table.reference} !~ '^[[:space:]]*$')`,
    ),
  ],
);

export const bookGenreEnum = pgEnum("book_genre", BOOK_GENRES);

// the genres a user likes, which drive their recommendations
export const userGenres = pgTable(
  "user_genres",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    genre: bookGenreEnum("genre").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.genre] })],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SavedBook = typeof savedBooks.$inferSelect;
export type BookRating = typeof bookRatings.$inferSelect;
export type BookNote = typeof bookNotes.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type CollectionBook = typeof collectionBooks.$inferSelect;
