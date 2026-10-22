import type { MouseEvent } from "react";  // type for mouse click event on an html element
import "./Header.css";

// define the props the Header component expects to receive: current page, navigation function
interface HeaderProps {
  page: "discover" | "personal-library";
  onNavigate: (page: "discover" | "personal-library") => void;
}

function Header({ page, onNavigate }: HeaderProps) {
  // helper: switch page when user clicks a link
  function navigate(
    event: MouseEvent<HTMLAnchorElement>,
    target: "discover" | "personal-library",
  ) {
    event.preventDefault();
    onNavigate(target);
  }

  return (
    <header className="site-header">
      <a className="site-logo" href="/" onClick={(event) => navigate(event, "discover")}>
        Bookworm
      </a>

      <nav className="main-nav" aria-label="Main navigation">
        <a href="/" onClick={(event) => navigate(event, "discover")}>Home</a>
        <a href="/search" onClick={(event) => navigate(event, "discover")}>Discover</a>
        <a href="/personal-library" aria-current={page === "personal-library" ? "page" : undefined} onClick={(event) => navigate(event, "personal-library")}>My Library</a>
        <a href="/account">Account</a>
      </nav>
    </header>
  );
}

export default Header;
