import { useState } from "react";
import { useAuth } from "./useAuth";
import { AuthForm } from "./components/AuthForm";
import SearchPage from "./pages/SearchPage";
import Header, { type AppPage } from "./components/Header";
import PersonalLibraryPage from "./pages/PersonalLibraryPage";

function App() {
  const { user, loading, logout } = useAuth();
  const [page, setPage] = useState<AppPage>("discover");

  if (loading) return <p>Loading</p>;
  if (!user) return <AuthForm />;

  return (
    <div>
      <Header page={page} onNavigate={setPage} />
      <button onClick={logout}>Log Out</button>

      {/* for now, either show personal library page or search page */}
      {page === "personal-library" ? (
        <PersonalLibraryPage onGoToDiscover={() => setPage("discover")} />
      ) : (
        <SearchPage />
      )}
    </div>
  );
}

export default App;
