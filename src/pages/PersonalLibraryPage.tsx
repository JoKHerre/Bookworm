import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { BookDetails } from "../../shared/books";
import {
  READING_STATUSES,
  type ReadingStatus,
} from "../../shared/readingStatus";
import { filterByTags, libraryTags } from "../../shared/tags";
import StarDisplay from "../components/StarDisplay";
import { getRatings } from "../ratingsApi";
import { bookDetailsPath, type BookDetailsLocationState } from "../routes";
import "./PersonalLibraryPage.css";

// define error messages
const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please sign in again.";
const STATUS_UPDATE_ERROR_MESSAGE =
  "Could not update this book's reading status. Please try again.";

const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  to_be_read: "To Be Read",
  currently_reading: "Currently Reading",
  finished: "Finished",
};

const READING_STATUS_OPTIONS = READING_STATUSES.map((value) => ({
  value,
  label: READING_STATUS_LABELS[value],
}));

// define the shape of a saved book object as returned by the server
interface SavedBook {
  id: number;
  bookKey: string;
  createdAt: string;
  readingStatus: ReadingStatus;
}

// PersonalLibraryBook: SavedBook plus any additional details
interface PersonalLibraryBook extends SavedBook {
  details: BookDetails | null;
}

function PersonalLibraryPage() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<PersonalLibraryBook[]>([]); // the saved books
  const [loading, setLoading] = useState(true); // whether the list of saved books is currently loading
  const [error, setError] = useState(""); // message to display in case of error loading the saved books
  const [removalError, setRemovalError] = useState(""); // message to display if removing a book fails
  const [removingBookIds, setRemovingBookIds] = useState<Set<number>>(
    () => new Set(),
  ); // saved-book rows whose removal requests are in progress
  const [updatingReadingStatusIds, setUpdatingReadingStatusIds] = useState<
    Set<number>
  >(() => new Set()); // saved-book rows whose reading status requests are in progress
  const [readingStatusErrors, setReadingStatusErrors] = useState<
    Record<number, string>
  >({}); // errors to display beside the affected book's status control
  const [ratings, setRatings] = useState<Map<string, number>>(() => new Map()); // the user's rating for each rated bookKey
  const [selectedTags, setSelectedTags] = useState<string[]>([]); // tags a book must all have to be shown; empty shows every book
  const [loadAttempt, setLoadAttempt] = useState(0); // counter to trigger reloading the saved books when the user clicks "Try again"

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

  async function updateReadingStatus(
    id: number,
    title: string,
    readingStatus: ReadingStatus,
  ) {
    // capture current status, to be restored if the update fails
    const previousStatus = books.find((book) => book.id === id)?.readingStatus;
    if (!previousStatus) return;

    setReadingStatusErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[id];
      return nextErrors;
    });
    setUpdatingReadingStatusIds((currentIds) => new Set(currentIds).add(id));
    // show the selected option immediately; restore the saved value if the update fails.
    setBooks((currentBooks) =>
      currentBooks.map((book) =>
        book.id === id ? { ...book, readingStatus } : book,
      ),
    );

    let requestError = "";
    try {
      // attempt PATCH request to update the reading status on the server
      const response = await fetch(`/api/library/${id}/reading-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingStatus }),
      });

      // assign requestError based on the response status code, if applicable
      if (response.status === 401) {
        requestError = SESSION_EXPIRED_MESSAGE;
      } else if (response.status === 404) {
        requestError = `Could not find “${title}” in your library to update.`;
      } else if (!response.ok) {
        requestError = STATUS_UPDATE_ERROR_MESSAGE;
      } else {
        // successful PATCH
        // update book in the state with its new reading status as returned by the server
        const data = (await response.json()) as {
          id: number;
          readingStatus: ReadingStatus;
        };
        setBooks((currentBooks) =>
          currentBooks.map((book) =>
            book.id === id
              ? { ...book, readingStatus: data.readingStatus }
              : book,
          ),
        );
      }
    } catch {
      requestError = STATUS_UPDATE_ERROR_MESSAGE;
    } finally {
      // remove the book's id from the set of books being updated, regardless of success or failure
      setUpdatingReadingStatusIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(id);
        return nextIds;
      });
    }

    // if error, restore previous reading status and display error msg
    if (requestError) {
      setBooks((currentBooks) =>
        currentBooks.map((book) =>
          book.id === id ? { ...book, readingStatus: previousStatus } : book,
        ),
      );
      setReadingStatusErrors((currentErrors) => ({
        ...currentErrors,
        [id]: requestError,
      }));
    }
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

        // ratings are optional extras: if they fail to load, cards just show no rating
        const userRatings = await getRatings().catch(() => []);

        // if current request, store the array of saved books w their details in the books state
        if (isCurrentRequest) {
          setBooks(booksWithDetails);
          setRatings(new Map(userRatings.map((r) => [r.bookKey, r.rating])));
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

  function viewBook(bookKey: string) {
    const state: BookDetailsLocationState = {
      backLabel: "Back to My Personal Library",
    };
    void navigate(bookDetailsPath(bookKey), { state });
  }

  // selected tags that no longer exist in the library are ignored
  const availableTags = libraryTags(books);
  const activeTags = selectedTags.filter((tag) => availableTags.includes(tag));
  const visibleBooks = filterByTags(books, activeTags);

  function toggleTag(tag: string) {
    setSelectedTags(
      activeTags.includes(tag)
        ? activeTags.filter((activeTag) => activeTag !== tag)
        : [...activeTags, tag],
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
              <button type="button" onClick={() => void navigate("/search")}>
                Discover books
              </button>
            </div>
          ) : (
            <>
              {availableTags.length > 0 && (
                <fieldset className="personal-library-tag-filter">
                  <legend>Filter by tags</legend>
                  {availableTags.map((tag) => (
                    <label key={tag}>
                      <input
                        type="checkbox"
                        checked={activeTags.includes(tag)}
                        onChange={() => toggleTag(tag)}
                      />
                      {tag}
                    </label>
                  ))}
                  <button
                    type="button"
                    disabled={activeTags.length === 0}
                    onClick={() => setSelectedTags([])}
                  >
                    Clear tags
                  </button>
                </fieldset>
              )}
              {visibleBooks.length === 0 ? (
                <p className="personal-library-message" role="status">
                  No books match these tags.
                </p>
              ) : (
                <ul
                  className="personal-library-book-grid"
                  aria-label="Saved books"
                >
                  {visibleBooks.map(
                    ({ id, bookKey, details, readingStatus }) => {
                      const title =
                        details?.title ?? "Book details unavailable";
                      const coverId = details?.covers?.[0];
                      const isRemoving = removingBookIds.has(id);
                      const isUpdatingReadingStatus =
                        updatingReadingStatusIds.has(id);
                      const readingStatusError = readingStatusErrors[id];
                      const rating = ratings.get(bookKey);

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
                                onClick={() => viewBook(bookKey)}
                              >
                                {title}
                              </button>
                            </h3>
                            <p>
                              {details?.authors.join(", ") ||
                                "Author unavailable"}
                            </p>
                            {rating !== undefined && (
                              <StarDisplay rating={rating} />
                            )}
                            {!details && (
                              <p className="personal-library-book-key">
                                {bookKey}
                              </p>
                            )}
                          </div>
                          <div className="personal-library-book-status">
                            <select
                              aria-label={`Reading status for ${title}`}
                              aria-busy={isUpdatingReadingStatus}
                              aria-describedby={
                                readingStatusError
                                  ? `reading-status-error-${id}`
                                  : undefined
                              }
                              disabled={isUpdatingReadingStatus}
                              value={readingStatus}
                              onChange={(event) =>
                                void updateReadingStatus(
                                  id,
                                  title,
                                  event.target.value as ReadingStatus,
                                )
                              }
                            >
                              {READING_STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            {isUpdatingReadingStatus && (
                              <p
                                className="personal-library-book-status-message"
                                role="status"
                              >
                                Saving status…
                              </p>
                            )}
                            {readingStatusError && (
                              <p
                                className="personal-library-book-status-error"
                                id={`reading-status-error-${id}`}
                                role="alert"
                              >
                                {readingStatusError}
                              </p>
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
                    },
                  )}
                </ul>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default PersonalLibraryPage;
