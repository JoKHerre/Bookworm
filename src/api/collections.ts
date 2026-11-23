import z from "zod";
import { openLibraryWorkKey } from "../../shared/books";
import { READING_STATUSES } from "../../shared/readingStatus";

import type {
  CollectionSummary,
  CollectionDetailResponse,
} from "../../shared/collections";
import type { SavedBook } from "../../shared/library";
import { apiRequest, ApiRequestError, errorMessage } from "./client";
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

const operationErrors = {
  list: "Could not load your collections.",
  create: "Could not create this collection.",
  rename: "Could not rename this collection.",
  delete: "Could not delete this collection.",
  membership: "Could not add this book to the collection.",
  read: "Could not load this collection.",
  remove: "Could not remove this book from the collection.",
};

type Operation = keyof typeof operationErrors;

async function request(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } | undefined,
  operation: Operation,
): Promise<unknown> {
  try {
    return await apiRequest<unknown>(`/api/collections${path}`, init);
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error;
    if (error.status === 0)
      throw new Error(operationErrors[operation], { cause: error });
    const messages: Partial<Record<number, string>> = {
      401: "Your session has expired. Please log in again.",
      404: "This collection is no longer available.",
    };
    if (operation === "create" || operation === "rename") {
      messages[400] = "Enter a collection name of 1–100 characters.";
      messages[409] = "You already have a collection with that name.";
    }
    if (operation === "membership") {
      messages[404] = "This book or collection is no longer available.";
      messages[409] = "This book is already in this collection.";
    }
    if (operation === "read")
      messages[400] = "This collection link is invalid.";
    if (operation === "remove")
      messages[404] = "This book is no longer in this collection.";
    throw new ApiRequestError(
      error.status,
      errorMessage(error, {
        fallback: operationErrors[operation],
        byStatus: messages,
      }),
      { cause: error },
    );
  }
}

export async function listCollections(
  signal?: AbortSignal,
): Promise<CollectionSummary[]> {
  const response = await request("", { signal }, "list");
  const data = readResponse(
    response,
    collectionListResponse,
    operationErrors.list,
  );
  return data.collections;
}

function readResponse<T extends z.ZodType>(
  response: unknown,
  schema: T,
  message: string,
): z.infer<T> {
  const parsed = schema.safeParse(response);
  if (!parsed.success) throw new Error(message);
  return parsed.data;
}

export async function createCollection(
  name: string,
): Promise<CollectionSummary> {
  const response = await request(
    "",
    {
      method: "POST",
      body: { name: name.trim() },
    },
    "create",
  );
  return readResponse(
    response,
    collectionSummary,
    "Could not confirm that the collection was created. Reload My Library to check.",
  );
}

export async function renameCollection(
  id: number,
  name: string,
): Promise<CollectionSummary> {
  const response = await request(
    `/${id}`,
    {
      method: "PATCH",
      body: { name: name.trim() },
    },
    "rename",
  );
  return readResponse(
    response,
    collectionSummary,
    "Could not confirm that the collection was renamed. Reload My Library to check.",
  );
}

export async function deleteCollection(id: number): Promise<void> {
  await request(`/${id}`, { method: "DELETE" }, "delete");
}

export async function getCollection(
  id: number,
  signal?: AbortSignal,
): Promise<CollectionDetails> {
  const response = await request(`/${id}`, { signal }, "read");
  return readResponse(
    response,
    collectionDetailsResponse,
    operationErrors.read,
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
  const response = await request(`?${query}`, { signal }, "list");
  const data = readResponse(
    response,
    membershipListResponse,
    operationErrors.list,
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
  return readResponse(
    response,
    savedBook,
    "Could not confirm that the book was added. Refresh collections to check.",
  );
}
