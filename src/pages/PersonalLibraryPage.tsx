import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { BookDetails } from "../../shared/books";
import {
  READING_STATUS_LABELS,
  type ReadingStatus,
} from "../../shared/readingStatus";
import { filterByTags, libraryTags } from "../../shared/tags";
import SavedBookCard from "../components/SavedBookCard";
import CollectionsManager from "../components/CollectionsManager";
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
  "Your session has expired. Please log in again.";
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
  bookKey: string;
}

function PersonalLibraryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab =
    searchParams.get("tab") === "collections" ? "collections" : "books";
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);

  function selectTab(tab: "books" | "collections") {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (tab === "books") next.delete("tab");
      else next.set("tab", tab);
      return next;
    });
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight")
      nextIndex = 1 - index;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = 1;
    else return;
    event.preventDefault();
    selectTab(nextIndex === 0 ? "books" : "collections");
    tabButtons.current[nextIndex]?.focus();
  }
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
  const [committingRemovals, setCommittingRemovals] = useState<
    PendingRemoval[]
  >([]);
  const [collectionsRevision, setCollectionsRevision] = useState(0);
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
    setCommittingRemovals((current) => [...current, removal]);
    try {
      await removeSavedBook(removal.id);
      setBooks((currentBooks) =>
        currentBooks.filter((book) => book.id !== removal.id),
      );
      setCollectionsRevision((current) => current + 1);
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
      setCommittingRemovals((current) =>
        current.filter((book) => book.id !== removal.id),
      );
    }
  }

  function flushRemoval() {
    window.clearTimeout(removalTimer.current);
    const removal = pendingRemovalRef.current;
    pendingRemovalRef.current = null;
    setPendingRemoval(null);
    if (removal) void commitRemoval(removal);
  }

  function removeBook(id: number, title: string) {
    const book = books.find((book) => book.id === id);
    if (!book) return;
    flushRemoval(); // only one removal waits on Undo at a time
    setRemovalError("");
    const removal = { id, title, bookKey: book.bookKey };
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

  const removals = pendingRemoval
    ? [...committingRemovals, pendingRemoval]
    : committingRemovals;
  const listedBooks = books.filter(
    (book) => !removals.some((removal) => removal.id === book.id),
  );
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

  function renderBook(book: PersonalLibraryBook) {
    const title = book.details?.title ?? "Book details unavailable";
    return (
      <SavedBookCard
        key={book.id}
        book={book}
        rating={ratings.get(book.bookKey)}
        removeFrom="library"
        onViewBook={() => viewBook(book.bookKey)}
        onReadingStatusChange={(status) =>
          void updateReadingStatus(book.id, title, status)
        }
        onRemove={() => removeBook(book.id, title)}
        isUpdatingReadingStatus={updatingReadingStatusIds.has(book.id)}
        readingStatusError={readingStatusErrors[book.id]}
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
          <Link className="personal-library-import-link" to="/import">
            Import books
          </Link>
        </section>

        <div
          className="personal-library-tabs"
          role="tablist"
          aria-label="Library sections"
        >
          {(["books", "collections"] as const).map((tab, index) => (
            <button
              key={tab}
              ref={(button) => {
                tabButtons.current[index] = button;
              }}
              type="button"
              role="tab"
              id={`personal-library-${tab}-tab`}
              aria-controls={`personal-library-${tab}-panel`}
              aria-selected={activeTab === tab}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => selectTab(tab)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {tab === "books" ? "Books" : "Collections"}
            </button>
          ))}
        </div>

        <div
          id="personal-library-books-panel"
          role="tabpanel"
          aria-labelledby="personal-library-books-tab"
          hidden={activeTab !== "books"}
          tabIndex={0}
        >
          <section className="personal-library-books" aria-label="Books">
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
                        <h3
                          className="personal-library-shelf-title"
                          id={headingId}
                        >
                          {READING_STATUS_LABELS[status]}{" "}
                          <span className="personal-library-shelf-count">
                            {shelf.length}
                          </span>
                        </h3>
                        <ul
                          className="saved-book-grid"
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
          </section>
        </div>
        <div
          id="personal-library-collections-panel"
          role="tabpanel"
          aria-labelledby="personal-library-collections-tab"
          hidden={activeTab !== "collections"}
          tabIndex={0}
        >
          <CollectionsManager
            removedBookKeys={removals.map((book) => book.bookKey)}
            refreshVersion={collectionsRevision}
          />
        </div>

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
