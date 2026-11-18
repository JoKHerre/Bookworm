export interface CollectionSummary {
  id: number;
  name: string;
  createdAt: string;
  bookCount: number;
}

export class CollectionApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
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
      400: "Use a collection name of 1–100 characters without null characters.",
      401: "Your session has expired. Please sign in again.",
      404: "This collection is no longer available. The list has been refreshed.",
      409: "A collection with this name already exists. Choose another name.",
    };
    throw new CollectionApiError(
      response.status,
      messages[response.status] ??
        "Could not save your collection changes. Please try again.",
    );
  }
  return response;
}

export async function listCollections(
  signal?: AbortSignal,
): Promise<CollectionSummary[]> {
  const response = await request("", { signal });
  const data = (await response.json()) as { collections: CollectionSummary[] };
  return data.collections;
}

export async function createCollection(
  name: string,
): Promise<CollectionSummary> {
  const response = await request("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
  return response.json() as Promise<CollectionSummary>;
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
  return response.json() as Promise<CollectionSummary>;
}

export async function deleteCollection(id: number): Promise<void> {
  await request(`/${id}`, { method: "DELETE" });
}
