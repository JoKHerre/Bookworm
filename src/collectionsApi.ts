import z from "zod";

export interface CollectionSummary {
  id: number;
  name: string;
  createdAt: string;
  bookCount: number;
}

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

export class CollectionApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(
  path: string,
  init?: RequestInit,
  operation: "manage" | "membership" = "manage",
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/collections${path}`, init);
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new Error("Could not reach your collections. Please try again.", {
      cause: error,
    });
  }
  if (!response.ok) {
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
    throw new CollectionApiError(
      response.status,
      messages[response.status] ??
        (operation === "membership"
          ? "Could not add this book to the collection. Please try again."
          : "Could not save your collection changes. Please try again."),
    );
  }
  return response;
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
  response: Response,
  schema: T,
  message: string,
): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error(message);
  return parsed.data;
}

export async function createCollection(
  name: string,
): Promise<CollectionSummary> {
  const response = await request("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
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
): Promise<void> {
  await request(
    `/${collectionId}/books`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookKey }),
    },
    "membership",
  );
}
