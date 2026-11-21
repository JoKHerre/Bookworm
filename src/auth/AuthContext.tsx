import { useEffect, useState, type ReactNode } from "react";
import { type PublicUser } from "../../shared/auth";
import * as authApi from "../api/auth";
import { onUnauthorized } from "../api/client";
import { AuthContext, type AuthContextValue } from "./useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .getCurrentUser()
      .catch(() => null)
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  // a 401 from any other request means the session has ended
  useEffect(() => {
    onUnauthorized(() => setUser(null));
    return () => onUnauthorized(null);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    login: async (credentials) => setUser(await authApi.login(credentials)),
    register: async (credentials) =>
      setUser(await authApi.register(credentials)),
    logout: async () => {
      await authApi.logout();
      setUser(null);
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}
