function Header() {
    return (
        <header className="site-header">
            <div className="header-left">
                <a className="site-logo" href="/">
                    Bookworm
                </a>
            </div>
                <form className="header-search" 
                onSubmit={(event) => event.preventDefault()}>
                    <input
                        type="search"
                        placeholder="Search books..."
                        ></input>
                    <button type="submit">
                        Search
                    </button>
                </form>
                <div className="header-right">
                    <nav className="main-nav">
                        <a href="">Home</a>
                        <a href="">Discover</a>
                        <a href="">Reading List</a>
                        <a href="">Account</a>
                    </nav>
                </div>
        </header>
    );
}

export default Header;