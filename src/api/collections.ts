import z from "zod";
import { openLibraryWorkKey } from "../../shared/books";
import { READING_STATUSES } from "../../shared/readingStatus";

import type {
  CollectionSummary,
  CollectionDetailResponse,
} from "../../shared/collections";
import type { SavedBook } from "../../shared/library";
import { apiRequest, ApiRequestError } from "./client";
export type { CollectionSummary } from "../../shared/collections";

// for checking a book's membership in a collection
export interface CollectionMembershipSummary extends CollectionSummary {
  containsBook: boolean;
}

const collectionSummary = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  createdAt: z.string(),
  bookCount: z.number().int().nonnegative(),
});

const collectionListResponse = z.object({
  collections: z.array(collectionSummary),
});

const membershipListResponse = z.object({
  collections: z.array(collectionSummary.extend({ containsBook: z.boolean() })),
});

const savedBook = z.object({
  id: z.number().int().positive(),
  bookKey: openLibraryWorkKey,
  readingStatus: z.enum(READING_STATUSES),
  createdAt: z.string(),
});

const collectionDetailsResponse = z.object({
  collection: collectionSummary,
  books: z.array(savedBook),
});

export type CollectionDetails = CollectionDetailResponse;

async function request(
  path: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
  operation: "manage" | "membership" | "read" | "remove" = "manage",
): Promise<unknown> {
  try {
    return await apiRequest<unknown>(`/api/collections${path}`, {
      method: init?.method,
      body: init?.body,
      signal: init?.signal ?? undefined,
    });
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error;
    if (error.status === 0)
      throw new Error("Could not reach your collections. Please try again.", {
        cause: error,
      });
    const messages: Record<number, string> = {
      400:
        operation === "membership"
          ? "Could not add this book. The book or collection identifier is invalid."
          : "Use a collection name of 1–100 characters without null characters.",
      401: "Your session has expired. Please sign in again.",
      404:
        operation === "membership"
          ? "This book or collection is no longer available."
          : "This collection is no longer available.",
      409:
        operation === "membership"
          ? "This book is already in this collection."
          : "A collection with this name already exists. Choose another name.",
    };
    if (operation === "read" || operation === "remove") {
      messages[400] =
        operation === "read"
          ? "Invalid collection ID."
          : "Invalid collection or saved book ID.";
      messages[404] =
        operation === "read"
          ? "Collection not found."
          : "This book is no longer available in this collection.";
    }
    const fallbackMessages = {
      manage: "Could not save your collection changes. Please try again.",
      membership:
        "Could not add this book to the collection. Please try again.",
      read: "Could not load this collection. Please try again.",
      remove:
        "Could not remove this book from the collection. Please try again.",
    };
    throw new ApiRequestError(
      error.status,
      messages[error.status] ?? fallbackMessages[operation],
    );
  }
}

export async function listCollections(
  signal?: AbortSignal,
): Promise<CollectionSummary[]> {
  const response = await request("", { signal });
  const data = await readResponse(
    response,
    collectionListResponse,
    "Could not read your collections. Please try again.",
  );
  return data.collections;
}

async function readResponse<T extends z.ZodType>(
  response: unknown,
  schema: T,
  message: string,
): Promise<z.infer<T>> {
  const parsed = schema.safeParse(response);
  if (!parsed.success) throw new Error(message);
  return parsed.data;
}

export async function createCollection(
  name: string,
): Promise<CollectionSummary> {
  const response = await request("", {
    method: "POST",
    body: { name: name.trim() },
  });
  return readResponse(
    response,
    collectionSummary,
    "Could not read the created collection. Please try again.",
  );
}

export async function renameCollection(
  id: number,
  name: string,
): Promise<CollectionSummary> {
  const response = await request(`/${id}`, {
    method: "PATCH",
    body: { name: name.trim() },
  });
  return readResponse(
    response,
    collectionSummary,
    "Could not read the renamed collection. Please try again.",
  );
}

export async function deleteCollection(id: number): Promise<void> {
  await request(`/${id}`, { method: "DELETE" });
}

export async function getCollection(
  id: number,
  signal?: AbortSignal,
): Promise<CollectionDetails> {
  const response = await request(`/${id}`, { signal }, "read");
  return readResponse(
    response,
    collectionDetailsResponse,
    "Could not read this collection. Please try again.",
  );
}

export async function removeBookFromCollection(
  collectionId: number,
  savedBookId: number,
): Promise<void> {
  await request(
    `/${collectionId}/books/${savedBookId}`,
    { method: "DELETE" },
    "remove",
  );
}

export async function listCollectionsForBook(
  bookKey: string,
  signal?: AbortSignal,
): Promise<CollectionMembershipSummary[]> {
  const query = new URLSearchParams({ bookKey });
  const response = await request(`?${query}`, { signal }, "membership");
  const data = await readResponse(
    response,
    membershipListResponse,
    "Could not read your collection options. Please try again.",
  );
  return data.collections;
}

// The server saves the work to My Library if needed in the same transaction.
export async function addBookToCollection(
  collectionId: number,
  bookKey: string,
): Promise<SavedBook> {
  const response = await request(
    `/${collectionId}/books`,
    {
      method: "POST",
      body: { bookKey },
    },
    "membership",
  );
  return readResponse(response, savedBook, "Could not read the saved book.");
}
