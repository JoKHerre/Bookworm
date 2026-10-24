import { useEffect, useState } from "react";
import type { BookDetails } from "../../shared/books";
import BookDetailsPage from "./BookDetailsPage";
import "./PersonalLibraryPage.css";

const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please sign in again.";

// define props the PersonalLibraryPage component expects to receive: a function to navigate to the Discover page
interface PersonalLibraryPageProps {
  onGoToDiscover: () => void;
}

// define the shape of a saved book object as returned by the server
interface SavedBook {
  id: number;
  bookKey: string;
  createdAt: string;
}

// PersonalLibraryBook: SavedBook plus any additional details
interface PersonalLibraryBook extends SavedBook {
  details: BookDetails | null;
}

function PersonalLibraryPage({ onGoToDiscover }: PersonalLibraryPageProps) {
  const [books, setBooks] = useState<PersonalLibraryBook[]>([]); // the saved books
  const [loading, setLoading] = useState(true); // whether the list of saved books is currently loading
  const [error, setError] = useState(""); // message to display in case of error loading the saved books
  const [removalError, setRemovalError] = useState(""); // message to display if removing a book fails
  const [removingBookIds, setRemovingBookIds] = useState<Set<number>>(
    () => new Set(),
  ); // saved-book rows whose removal requests are in progress
  const [loadAttempt, setLoadAttempt] = useState(0); // counter to trigger reloading the saved books when the user clicks "Try again"
  const [selectedBookKey, setSelectedBookKey] = useState<string | null>(null); // for clicking on a book to view detail view

  // remove a book:
  async function removeBook(id: number, title: string) {
    const genericRemovalError = `Could not remove “${title}” from your library. Please try again.`;
    let requestError = "";

    // clear any previous removal error msg + add book's id to set of books being removed
    setRemovalError("");
    setRemovingBookIds((currentIds) => new Set(currentIds).add(id));

    try {
      // send DELETE request to server
      const response = await fetch(`/api/library/${id}`, { method: "DELETE" });

      // handle error status codes with error messages to display to user
      if (response.status === 401) {
        requestError = SESSION_EXPIRED_MESSAGE;
      } else if (response.status === 404) {
        requestError = `Could not find “${title}” in your library to remove.`;
      } else if (!response.ok) {
        requestError = genericRemovalError;
      } else {
        // successful DELETE: update the visible list by filtering out the removed book
        setBooks((currentBooks) =>
          currentBooks.filter((book) => book.id !== id),
        );
      }
    } catch {
      // Network failures should use a friendly message instead of a browser error.
      requestError = genericRemovalError;
    } finally {
      // remove the book's id from the set of books being removed, regardless of success or failure
      setRemovingBookIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(id);
        return nextIds;
      });
    }

    if (requestError) setRemovalError(requestError);
  }

  useEffect(() => {
    let isCurrentRequest = true;

    // loading the personal library: fetch list of saved books, then fetch details for each book
    async function loadPersonalLibrary() {
      // set loading to true and clear any previous error message
      setLoading(true);
      setError("");

      try {
        // requests GET /api/library to retrieve the user's saved books
        const response = await fetch("/api/library");

        // interprets error status codes and sets error msg to display to user
        if (response.status === 401) {
          throw new Error(SESSION_EXPIRED_MESSAGE);
        }
        if (!response.ok) {
          throw new Error("Could not load your personal library.");
        }

        // else, successful response: parse the JSON and fetch details for each saved book
        // read response, treat it as an object containing an array of SavedBook's, called "books"
        const data = (await response.json()) as { books: SavedBook[] };
        const booksWithDetails = await Promise.all(
          data.books.map(async (savedBook) => {
            // for each SavedBook
            try {
              // fetch book's details (title, author, etc) using bookKey
              const detailsResponse = await fetch(
                `/api/books/details?key=${encodeURIComponent(savedBook.bookKey)}`,
              );

              // if fails, return the savedBook with details set to null
              if (!detailsResponse.ok) {
                return { ...savedBook, details: null };
              }

              // success: read book details and return the savedBook with its details
              const details = (await detailsResponse.json()) as BookDetails;
              return { ...savedBook, details };
            } catch {
              // any other error: also return the savedBook with details set to null
              return { ...savedBook, details: null };
            }
          }),
        );

        // if current request, store the array of saved books w their details in the books state
        if (isCurrentRequest) {
          setBooks(booksWithDetails);
        }
      } catch (loadError) {
        // load error: store error msg
        if (isCurrentRequest) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load your personal library.",
          );
        }
      } finally {
        // set loading to false, to signify that request is complete
        if (isCurrentRequest) {
          setLoading(false);
        }
      }
    }

    // call the function to load the personal library
    void loadPersonalLibrary();

    return () => {
      isCurrentRequest = false;
    };
  }, [loadAttempt]);

  // if a book is selected, shows its BookDetailsPage and set the var back to null when user clicks back
  if (selectedBookKey) {
    return (
      <BookDetailsPage
        bookKey={selectedBookKey}
        backLabel="Back to My Personal Library"
        onBack={() => setSelectedBookKey(null)}
      />
    );
  }

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
              <p>Books you’ve saved to your personal library.</p>
            </div>
          </div>

          {removalError && (
            <p className="personal-library-removal-error" role="alert">
              {removalError}
            </p>
          )}

          {/* display loading msg, error + try again button if failure, empty state if no saved books, or the list of saved books */}
          {loading ? (
            <p className="personal-library-message" role="status">
              Loading your personal library...
            </p>
          ) : error ? (
            <div className="personal-library-empty-state" role="alert">
              <h3>We couldn’t load your books</h3>
              <p>{error}</p>
              <button
                type="button"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              >
                Try again
              </button>
            </div>
          ) : books.length === 0 ? (
            <div className="personal-library-empty-state">
              <h3>Your library is ready for its first book</h3>
              <p>Explore books and save the ones you’re interested in.</p>
              <button type="button" onClick={onGoToDiscover}>
                Discover books
              </button>
            </div>
          ) : (
            <ul className="personal-library-book-grid" aria-label="Saved books">
              {books.map(({ id, bookKey, details }) => {
                const title = details?.title ?? "Book details unavailable";
                const coverId = details?.covers?.[0];
                const isRemoving = removingBookIds.has(id);

                return (
                  <li className="personal-library-book-card" key={id}>
                    {coverId ? (
                      <img
                        className="personal-library-book-cover"
                        src={`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`}
                        alt={`Cover of ${title}`}
                      />
                    ) : (
                      <div
                        className="personal-library-book-cover personal-library-book-cover--placeholder"
                        aria-hidden="true"
                      />
                    )}
                    {/* select book to view details */}
                    <div className="personal-library-book-details">
                      <h3>
                        <button
                          className="personal-library-book-title"
                          type="button"
                          aria-label={`View details for ${title}`}
                          onClick={() => setSelectedBookKey(bookKey)}
                        >
                          {title}
                        </button>
                      </h3>
                      <p>
                        {details?.authors.join(", ") || "Author unavailable"}
                      </p>
                      {!details && (
                        <p className="personal-library-book-key">{bookKey}</p>
                      )}
                    </div>
                    <button
                      className="personal-library-book-remove"
                      type="button"
                      aria-label={`${isRemoving ? "Removing" : "Remove"} ${title} from my library`}
                      aria-busy={isRemoving}
                      disabled={isRemoving}
                      onClick={() => void removeBook(id, title)}
                    >
                      {isRemoving ? "Removing…" : "Remove"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default PersonalLibraryPage;
