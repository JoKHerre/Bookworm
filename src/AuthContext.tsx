import { useEffect, useState, type ReactNode } from "react";
import { type PublicUser } from "../shared/auth";
import * as authApi from "./api/auth";
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
