import type { SavedBook } from "./library.ts";

// Response bodies for /api/collections. See shared/library.ts for the D parameter.

export interface CollectionSummary<D = string> {
  id: number;
  name: string;
  createdAt: D;
  bookCount: number;
}

// GET /api/collections; containsBook is present when the bookKey query is given
export interface CollectionListResponse<D = string> {
  collections: (CollectionSummary<D> & { containsBook?: boolean })[];
}

// GET /api/collections/:collectionId
export interface CollectionDetailResponse<D = string> {
  collection: CollectionSummary<D>;
  books: SavedBook<D>[];
}
