import "./PersonalLibraryPage.css";

// define props the PersonalLibraryPage component expects to receive: a function to navigate to the Discover page
interface PersonalLibraryPageProps {
  onGoToDiscover: () => void;
}

// define the personal library page component: display user's saved books, or empty state if none saved yet
function PersonalLibraryPage({ onGoToDiscover }: PersonalLibraryPageProps) {
  return (
    <div className="personal-library-shell">
      <main className="personal-library-page" id="personal-library">
        <section
          className="personal-library-welcome"
          aria-labelledby="personal-library-title"
        >
          <h1 id="personal-library-title">My Library</h1>
        </section>

        {/* saved books collection */}
        <section
          className="personal-library-books"
          aria-labelledby="personal-library-books-title"
        >
          <div className="personal-library-books-heading">
            <div>
              <h2 id="personal-library-books-title">Books</h2>
              <p>Your saved books will appear here.</p>
            </div>
          </div>

          {/* No saved books yet; show a "Discover Books" button that takes user to the Discover (aka search) page */}
          <div className="personal-library-empty-state">
            <h3>Your library is ready for its first book</h3>
            <p>Explore books and save the ones you’re interested in.</p>
            <button type="button" onClick={onGoToDiscover}>
              Discover books
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default PersonalLibraryPage;
