import { useAuth } from "./AuthContext";
import { AuthForm } from "./components/AuthForm";
import "./pages/SearchPage"
import SearchPage from "./pages/SearchPage";

function App() {
  const { user, loading, logout } = useAuth();

  if (loading) return <p>Loading</p>
  if (!user) return <AuthForm />;

  return (
    <div>
      <h1>Bookworm</h1>
      <button onClick={logout}>Log Out</button>
      <SearchPage></SearchPage>
    </div>
  );
}

export default App;
