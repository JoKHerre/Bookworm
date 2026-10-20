import { useAuth } from "./useAuth";
import { AuthForm } from "./components/AuthForm";
import SearchPage from "./pages/SearchPage";
import Header from "./components/Header";

function App() {
  const { user, loading, logout } = useAuth();

  if (loading) return <p>Loading</p>;
  if (!user) return <AuthForm />;

  return (
    <div>
      <Header></Header>
      <button onClick={logout}>Log Out</button>

      <SearchPage></SearchPage>
    </div>
  );
}

export default App;
