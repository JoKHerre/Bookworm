import type { ReadingStatus } from "./readingStatus.ts";

// Response bodies for /api/library. Timestamps are Date objects on the server
// and ISO 8601 strings once they reach the client as JSON, hence the D parameter.

// a row of the signed-in user's library
export interface SavedBook<D = string> {
  id: number;
  bookKey: string;
  readingStatus: ReadingStatus;
  createdAt: D;
}

// GET /api/library
export interface LibraryResponse<D = string> {
  books: SavedBook<D>[];
}

// POST /api/library
export interface SaveBookResponse<D = string> {
  id: number;
  userId: number;
  bookKey: string;
  createdAt: D;
}

// PATCH /api/library/:id/reading-status
export interface ReadingStatusResponse {
  id: number;
  readingStatus: ReadingStatus;
}

// POST /api/library/import
// keys in request order, each once
export interface ImportBooksResponse {
  added: string[];
  alreadySaved: string[];
}
