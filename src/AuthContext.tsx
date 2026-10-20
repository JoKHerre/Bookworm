import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { type Credentials, type PublicUser } from "../shared/auth";

type AuthContextValue = {
  user: PublicUser | null;
  loading: boolean;
  login: (credentials: Credentials) => Promise<void>;
  register: (credentials: Credentials) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function post(url: string, body: unknown): Promise<PublicUser> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? "Something went wrong");
  }
  return data as PublicUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? (res.json() as Promise<PublicUser>) : null))
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    login: async (credentials) =>
      setUser(await post("/api/auth/login", credentials)),
    register: async (credentials) =>
      setUser(await post("/api/auth/register", credentials)),
    logout: async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}
