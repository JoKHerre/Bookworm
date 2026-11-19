import type { Credentials, PublicUser } from "../../shared/auth";
import { ApiRequestError, apiRequest, userError } from "./client";

// the signed-in user, or null when nobody is signed in
export async function getCurrentUser(): Promise<PublicUser | null> {
  try {
    return await apiRequest<PublicUser>("/api/auth/me");
  } catch (err) {
    if (err instanceof ApiRequestError) return null;
    throw err;
  }
}

async function submitCredentials(url: string, credentials: Credentials) {
  try {
    return await apiRequest<PublicUser>(url, {
      method: "POST",
      body: credentials,
    });
  } catch (err) {
    throw userError(err, {
      fallback: "Something went wrong",
      useServerMessage: true,
    });
  }
}

export function login(credentials: Credentials) {
  return submitCredentials("/api/auth/login", credentials);
}

export function register(credentials: Credentials) {
  return submitCredentials("/api/auth/register", credentials);
}

// once the server has answered, the session is over even if it reported an error
export async function logout() {
  try {
    await apiRequest<null>("/api/auth/logout", { method: "POST" });
  } catch (err) {
    if (!(err instanceof ApiRequestError) || err.status === 0) throw err;
  }
}
