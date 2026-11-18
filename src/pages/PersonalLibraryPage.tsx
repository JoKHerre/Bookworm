import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { BookDetails } from "../../shared/books";
import {
  READING_STATUS_LABELS,
  READING_STATUS_OPTIONS,
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
// how long Undo stays offered before a removal is sent to the server
export const UNDO_REMOVE_MS = 6000;
// shelves in the order people look for them
const SHELVES: ReadingStatus[] = [
  "currently_reading",
  "to_be_read",
  "finished",
];

interface PersonalLibraryBook extends SavedBook {
  details: BookDetails | null | undefined; // undefined while still loading
}

interface PendingRemoval {
  id: number;
  title: string;
}

function PersonalLibraryPage() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<PersonalLibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removalError, setRemovalError] = useState("");
  // a removed book stays hidden here until Undo runs out, then it's deleted
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(
    null,
  );
  const removalTimer = useRef<number | undefined>(undefined);
  const pendingRemovalRef = useRef<PendingRemoval | null>(null);
  const [updatingReadingStatusIds, setUpdatingReadingStatusIds] = useState<
    Set<number>
  >(() => new Set());
  const [readingStatusErrors, setReadingStatusErrors] = useState<
    Record<number, string>
  >({}); // keyed by saved-book id
  const [ratings, setRatings] = useState<Map<string, number>>(() => new Map());
  const [selectedTags, setSelectedTags] = useState<string[]>([]); // a book must have every one; empty shows all
  const [loadAttempt, setLoadAttempt] = useState(0); // bumped by "Try again" to reload

  async function commitRemoval(removal: PendingRemoval) {
    try {
      await removeSavedBook(removal.id);
      setBooks((currentBooks) =>
        currentBooks.filter((book) => book.id !== removal.id),
      );
    } catch (err) {
      setRemovalError(
        errorMessage(err, {
          fallback: `Could not remove “${removal.title}” from your library.`,
          byStatus: {
            401: SESSION_EXPIRED_MESSAGE,
            404: `Could not find “${removal.title}” in your library to remove.`,
          },
        }),
      );
    } finally {
      setPendingRemoval((current) =>
        current?.id === removal.id ? null : current,
      );
    }
  }

  function flushRemoval() {
    window.clearTimeout(removalTimer.current);
    const removal = pendingRemovalRef.current;
    pendingRemovalRef.current = null;
    if (removal) void commitRemoval(removal);
  }

  function removeBook(id: number, title: string) {
    flushRemoval(); // only one removal waits on Undo at a time
    setRemovalError("");
    const removal = { id, title };
    pendingRemovalRef.current = removal;
    setPendingRemoval(removal);
    removalTimer.current = window.setTimeout(flushRemoval, UNDO_REMOVE_MS);
  }

  function undoRemoval() {
    window.clearTimeout(removalTimer.current);
    pendingRemovalRef.current = null;
    setPendingRemoval(null);
  }

  // leaving the page doesn't cancel a removal, it just stops waiting for Undo
  useEffect(
    () => () => {
      window.clearTimeout(removalTimer.current);
      const removal = pendingRemovalRef.current;
      if (removal) void removeSavedBook(removal.id).catch(() => {});
    },
    [],
  );

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

    // show the saved books as soon as they arrive, then fill in each book's
    // details as it loads; a failed details lookup leaves details null
    async function loadPersonalLibrary() {
      setLoading(true);
      setError("");

      try {
        const { books: savedBooks } = await getLibrary(signal);
        if (signal.aborted) return;
        setBooks(savedBooks.map((book) => ({ ...book, details: undefined })));
        setLoading(false);

        for (const { id, bookKey } of savedBooks) {
          void getBookDetails(bookKey, signal)
            .catch(() => null)
            .then((details) => {
              if (signal.aborted) return;
              setBooks((currentBooks) =>
                currentBooks.map((book) =>
                  book.id === id ? { ...book, details } : book,
                ),
              );
            });
        }

        // ratings are optional extras: if they fail to load, cards just show no rating
        const userRatings = await getRatings(signal).catch(() => []);
        if (!signal.aborted) {
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
          setLoading(false);
        }
      }
    }

    void loadPersonalLibrary();
    return () => controller.abort();
  }, [loadAttempt]);

  function viewBook(bookKey: string) {
    const state: BookDetailsLocationState = {
      backLabel: "Back to My Library",
    };
    void navigate(bookDetailsPath(bookKey), { state });
  }

  const listedBooks = books.filter((book) => book.id !== pendingRemoval?.id);
  // selected tags that no longer exist in the library are ignored
  const availableTags = libraryTags(listedBooks);
  const activeTags = selectedTags.filter((tag) => availableTags.includes(tag));
  const visibleBooks = filterByTags(listedBooks, activeTags);

  function toggleTag(tag: string) {
    setSelectedTags(
      activeTags.includes(tag)
        ? activeTags.filter((activeTag) => activeTag !== tag)
        : [...activeTags, tag],
    );
  }

  function renderBook({
    id,
    bookKey,
    details,
    readingStatus,
  }: PersonalLibraryBook) {
    const title =
      details === undefined
        ? "Loading…"
        : (details?.title ?? "Book details unavailable");
    const coverId = details?.covers?.[0];
    const isUpdatingReadingStatus = updatingReadingStatusIds.has(id);
    const readingStatusError = readingStatusErrors[id];
    const rating = ratings.get(bookKey);

    return (
      <li
        className="personal-library-book-card"
        key={id}
        aria-busy={details === undefined}
      >
        {coverId ? (
          <img
            className="personal-library-book-cover"
            src={`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`}
            alt={`Cover of ${title}`}
          />
        ) : (
          <div
            className={`personal-library-book-cover personal-library-book-cover--${
              details === undefined ? "loading" : "placeholder"
            }`}
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
          {details !== undefined && (
            <p>{details?.authors.join(", ") || "Author unavailable"}</p>
          )}
          {rating !== undefined && <StarDisplay rating={rating} />}
          {details === null && (
            <p className="personal-library-book-key">{bookKey}</p>
          )}
        </div>
        <div className="personal-library-book-status">
          <select
            aria-label={`Reading status for ${title}`}
            aria-busy={isUpdatingReadingStatus}
            aria-describedby={
              readingStatusError ? `reading-status-error-${id}` : undefined
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
            <p className="personal-library-book-status-message" role="status">
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
          aria-label={`Remove ${title} from my library`}
          onClick={() => removeBook(id, title)}
        >
          Remove
        </button>
      </li>
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
            <h2>We couldn’t load your books</h2>
            {error !== LOAD_ERROR && <p>{error}</p>}
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            >
              Try again
            </button>
          </div>
        ) : listedBooks.length === 0 ? (
          <div className="personal-library-empty-state">
            <h2>Your library is ready for its first book</h2>
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
              SHELVES.map((status) => {
                const shelf = visibleBooks.filter(
                  (book) => book.readingStatus === status,
                );
                if (shelf.length === 0) return null;
                const headingId = `shelf-${status}`;
                return (
                  <section
                    className="personal-library-shelf"
                    key={status}
                    aria-labelledby={headingId}
                  >
                    <h2 id={headingId}>
                      {READING_STATUS_LABELS[status]}{" "}
                      <span className="personal-library-shelf-count">
                        {shelf.length}
                      </span>
                    </h2>
                    <ul
                      className="personal-library-book-grid"
                      aria-labelledby={headingId}
                    >
                      {shelf.map(renderBook)}
                    </ul>
                  </section>
                );
              })
            )}
          </>
        )}

        {pendingRemoval && (
          <div className="personal-library-undo" role="status">
            <span>Removed “{pendingRemoval.title}”.</span>
            <button type="button" onClick={undoRemoval}>
              Undo
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default PersonalLibraryPage;
