import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { useAuth } from "./useAuth";
import { AuthForm } from "./components/AuthForm";
import SearchPage from "./pages/SearchPage";
import Header from "./components/Header";
import PersonalLibraryPage from "./pages/PersonalLibraryPage";
import BookDetailsPage from "./pages/BookDetailsPage";
import type { AuthLocationState } from "./routes";

function MainLayout() {
  return (
    <div>
      <Header />
      <Outlet />
    </div>
  );
}

function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    const state: AuthLocationState = { from: location };
    return <Navigate to="/login" state={state} replace />;
  }

  return <Outlet />;
}

function RedirectIfAuthed() {
  const { user } = useAuth();
  const location = useLocation();

  if (user) {
    const from = (location.state as AuthLocationState | null)?.from;
    return <Navigate to={from ?? "/search"} state={from?.state} replace />;
  }

  return <Outlet />;
}

function App() {
  const { loading } = useAuth();

  if (loading) return <p>Loading</p>;

  return (
    <Routes>
      <Route element={<RedirectIfAuthed />}>
        <Route path="/login" element={<AuthForm mode="login" />} />
        <Route path="/signup" element={<AuthForm mode="register" />} />
      </Route>

      <Route element={<MainLayout />}>
        <Route path="/" element={<Navigate to="/search" replace />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/books/*" element={<BookDetailsPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/personal-library" element={<PersonalLibraryPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
