import "./Header.css";

function Header() {
  return (
    <header className="site-header">
      <a className="site-logo" href="/">
        Bookworm
      </a>

      <nav className="main-nav">
        <a href="/">Home</a>
        <a href="/search">Discover</a>
        <a href="/reading-list">My Books</a>
        <a href="/account">Account</a>
      </nav>
    </header>
  );
}

export default Header;
