import { Link, NavLink, useLocation } from "react-router";
import type { AuthLocationState } from "../routes";
import { useAuth } from "../auth/useAuth";
import "./Header.css";

// NavLink sets aria-current="page" on the link matching the current URL
function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  // after logging in, come back to the page the user was on
  const loginState: AuthLocationState = { from: location };

  return (
    <header className="site-header">
      <NavLink className="site-logo" to="/">
        Bookworm
      </NavLink>

      <nav className="main-nav" aria-label="Main navigation">
        <NavLink to="/search">Discover</NavLink>
        <NavLink to="/personal-library">My Library</NavLink>
        {user ? (
          <button className="nav-auth-button" type="button" onClick={logout}>
            Log out
          </button>
        ) : (
          <Link to="/login" state={loginState} replace>
            Log in
          </Link>
        )}
      </nav>
    </header>
  );
}

export default Header;
