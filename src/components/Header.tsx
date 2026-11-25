import { Link, NavLink, useLocation } from "react-router";
import type { AuthLocationState } from "../routes";
import { useAuth } from "../auth/useAuth";
import { SCPL_BRANCHES } from "../../shared/branches";
import { useHomeBranch } from "../library/useHomeBranch";
import "./Header.css";

// NavLink sets aria-current="page" on the link matching the current URL
function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [branch, setBranch] = useHomeBranch();
  // after logging in, come back to the page the user was on
  const loginState: AuthLocationState = { from: location };
  // import is part of the library, so the library link stays marked there
  const libraryCurrent =
    location.pathname === "/personal-library"
      ? "page"
      : location.pathname === "/import"
        ? "true"
        : undefined;

  return (
    <header className="site-header">
      <NavLink className="site-logo" to="/">
        Bookworm
      </NavLink>

      <nav className="main-nav" aria-label="Main navigation">
        <select
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          aria-label="Home branch"
        >
          <option value="">All branches</option>
          {SCPL_BRANCHES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <NavLink to="/search">Discover</NavLink>
        <Link to="/personal-library" aria-current={libraryCurrent}>
          My Library
        </Link>
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
