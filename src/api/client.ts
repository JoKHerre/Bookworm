// Thrown by apiRequest when a request fails. status is 0 when no response
// arrived (a network failure); serverMessage is the body's `error`, if any.
export class ApiRequestError extends Error {
  readonly status: number;
  readonly serverMessage: string | undefined;

  constructor(status: number, serverMessage?: string, options?: ErrorOptions) {
    super(serverMessage ?? `Request failed with status ${status}`, options);
    this.name = "ApiRequestError";
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

let unauthorizedListener: (() => void) | null = null;

// Called when a request outside /api/auth gets a 401, meaning the session has
// ended, so the app can show the user as logged out. Pass null to stop.
export function onUnauthorized(listener: (() => void) | null) {
  unauthorizedListener = listener;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal | undefined;
}

// Send a request to our API and return its JSON body (null for an empty body).
// A cancelled request rethrows the AbortError; other failures throw ApiRequestError.
export async function apiRequest<T>(
  url: string,
  { method, body, signal }: RequestOptions = {},
): Promise<T> {
  const init: RequestInit = {};
  if (method) init.method = method;
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  if (signal) init.signal = signal;

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiRequestError(0, undefined, { cause: err });
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !url.startsWith("/api/auth/")) {
      unauthorizedListener?.();
    }
    const error =
      data && typeof data === "object" && "error" in data ? data.error : null;
    throw new ApiRequestError(
      response.status,
      typeof error === "string" ? error : undefined,
    );
  }
  return data as T;
}

interface Messages {
  fallback: string;
  // messages for specific statuses; 0 is a network failure
  byStatus?: Partial<Record<number, string>>;
  // show the server's own error message when there's no status message
  useServerMessage?: boolean;
}

function messageFor(error: ApiRequestError, messages: Messages) {
  return (
    messages.byStatus?.[error.status] ??
    (messages.useServerMessage ? error.serverMessage : undefined) ??
    messages.fallback
  );
}

// Turn a failed request into an Error carrying the message to show the user.
// Anything other than an ApiRequestError (such as an AbortError) passes through.
export function userError(error: unknown, messages: Messages): unknown {
  return error instanceof ApiRequestError
    ? new Error(messageFor(error, messages), { cause: error })
    : error;
}

// The message to show the user for any error from a request.
export function errorMessage(error: unknown, messages: Messages): string {
  return error instanceof ApiRequestError
    ? messageFor(error, messages)
    : messages.fallback;
}
