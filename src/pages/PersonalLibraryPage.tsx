import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { BookDetails } from "../../shared/books";
import {
  READING_STATUSES,
  type ReadingStatus,
} from "../../shared/readingStatus";
import { filterByTags, libraryTags } from "../../shared/tags";
import StarDisplay from "../components/StarDisplay";
import type { SavedBook } from "../../shared/library";
import { getBookDetails } from "../api/books";
import { errorMessage } from "../api/client";
import {
  getLibrary,
  removeSavedBook,
  updateReadingStatus as saveReadingStatus,
} from "../api/library";
import { getRatings } from "../api/ratings";
import { bookDetailsPath, type BookDetailsLocationState } from "../routes";
import "./PersonalLibraryPage.css";

const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please sign in again.";
const LOAD_ERROR = "Could not load your personal library.";
const STATUS_UPDATE_ERROR_MESSAGE =
  "Could not update this book's reading status.";

const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  to_be_read: "To Be Read",
  currently_reading: "Currently Reading",
  finished: "Finished",
};

const READING_STATUS_OPTIONS = READING_STATUSES.map((value) => ({
  value,
  label: READING_STATUS_LABELS[value],
}));

interface PersonalLibraryBook extends SavedBook {
  details: BookDetails | null;
}

function PersonalLibraryPage() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<PersonalLibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removalError, setRemovalError] = useState("");
  const [removingBookIds, setRemovingBookIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [updatingReadingStatusIds, setUpdatingReadingStatusIds] = useState<
    Set<number>
  >(() => new Set());
  const [readingStatusErrors, setReadingStatusErrors] = useState<
    Record<number, string>
  >({}); // keyed by saved-book id
  const [ratings, setRatings] = useState<Map<string, number>>(() => new Map());
  const [selectedTags, setSelectedTags] = useState<string[]>([]); // a book must have every one; empty shows all
  const [loadAttempt, setLoadAttempt] = useState(0); // bumped by "Try again" to reload

  async function removeBook(id: number, title: string) {
    setRemovalError("");
    setRemovingBookIds((currentIds) => new Set(currentIds).add(id));

    try {
      await removeSavedBook(id);
      setBooks((currentBooks) => currentBooks.filter((book) => book.id !== id));
    } catch (err) {
      setRemovalError(
        errorMessage(err, {
          fallback: `Could not remove “${title}” from your library.`,
          byStatus: {
            401: SESSION_EXPIRED_MESSAGE,
            404: `Could not find “${title}” in your library to remove.`,
          },
        }),
      );
    } finally {
      setRemovingBookIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(id);
        return nextIds;
      });
    }
  }

  async function updateReadingStatus(
    id: number,
    title: string,
    readingStatus: ReadingStatus,
  ) {
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

    try {
      const updated = await saveReadingStatus(id, readingStatus);
      setBooks((currentBooks) =>
        currentBooks.map((book) =>
          book.id === id
            ? { ...book, readingStatus: updated.readingStatus }
            : book,
        ),
      );
    } catch (err) {
      setBooks((currentBooks) =>
        currentBooks.map((book) =>
          book.id === id ? { ...book, readingStatus: previousStatus } : book,
        ),
      );
      setReadingStatusErrors((currentErrors) => ({
        ...currentErrors,
        [id]: errorMessage(err, {
          fallback: STATUS_UPDATE_ERROR_MESSAGE,
          byStatus: {
            401: SESSION_EXPIRED_MESSAGE,
            404: `Could not find “${title}” in your library to update.`,
          },
        }),
      }));
    } finally {
      setUpdatingReadingStatusIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(id);
        return nextIds;
      });
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    // fetch the saved books, then each book's details; a failed details lookup leaves details null
    async function loadPersonalLibrary() {
      setLoading(true);
      setError("");

      try {
        const { books: savedBooks } = await getLibrary(signal);
        const booksWithDetails = await Promise.all(
          savedBooks.map(async (savedBook) => ({
            ...savedBook,
            details: await getBookDetails(savedBook.bookKey, signal).catch(
              () => null,
            ),
          })),
        );

        // ratings are optional extras: if they fail to load, cards just show no rating
        const userRatings = await getRatings(signal).catch(() => []);

        if (!signal.aborted) {
          setBooks(booksWithDetails);
          setRatings(new Map(userRatings.map((r) => [r.bookKey, r.rating])));
        }
      } catch (loadError) {
        if (!signal.aborted) {
          setError(
            errorMessage(loadError, {
              fallback: LOAD_ERROR,
              byStatus: { 401: SESSION_EXPIRED_MESSAGE },
            }),
          );
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    void loadPersonalLibrary();
    return () => controller.abort();
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
          <Link className="personal-library-import-link" to="/import">
            Import books
          </Link>
        </section>

        <section
          className="personal-library-books"
          aria-labelledby="personal-library-books-title"
        >
          <div className="personal-library-books-heading">
            <h2 id="personal-library-books-title">Books</h2>
          </div>

          {removalError && (
            <p className="personal-library-removal-error" role="alert">
              {removalError}
            </p>
          )}

          {loading ? (
            <p className="personal-library-message" role="status">
              Loading…
            </p>
          ) : error ? (
            <div className="personal-library-empty-state" role="alert">
              <h3>We couldn’t load your books</h3>
              {error !== LOAD_ERROR && <p>{error}</p>}
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
              <button type="button" onClick={() => void navigate("/search")}>
                Discover books
              </button>
            </div>
          ) : (
            <>
              {availableTags.length > 0 && (
                <fieldset className="personal-library-tag-filter">
                  <legend>Filter by tags</legend>
                  <div className="personal-library-tag-options">
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
                  </div>
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
