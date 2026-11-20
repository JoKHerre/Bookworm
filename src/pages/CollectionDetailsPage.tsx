import { ApiRequestError } from "../api/client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { getBookDetails } from "../api/books";
import {
  getCollection,
  removeBookFromCollection,
  type CollectionSummary,
} from "../api/collections";
import SavedBookCard, {
  type SavedBookCardData,
} from "../components/SavedBookCard";
import { errorMessage } from "../api/client";
import { updateReadingStatus } from "../api/library";
import { getRatings } from "../api/ratings";
import {
  bookDetailsPath,
  type AuthLocationState,
  type BookDetailsLocationState,
} from "../routes";
import { useAuth } from "../auth/useAuth";
import "./CollectionDetailsPage.css";

export default function CollectionDetailsPage() {
  const { collectionId = "" } = useParams();
  const { user } = useAuth();
  if (!user) return null; // The route's RequireAuth guard handles login navigation.
  const id = Number(collectionId);
  if (!/^\d+$/.test(collectionId) || id < 1 || id > 2_147_483_647) {
    return (
      <CollectionShell>
        <h1>Collection unavailable</h1>
        <p role="alert">This collection link is invalid.</p>
      </CollectionShell>
    );
  }
  return (
    <CollectionDetailsContent key={`${id}:${user.id}`} collectionId={id} />
  );
}

function CollectionShell({ children }: { children: ReactNode }) {
  return (
    <div className="collection-details-shell">
      <main className="collection-details-page">
        <Link className="collection-back-link" to="/personal-library">
          Back to My Library
        </Link>
        {children}
      </main>
    </div>
  );
}

function CollectionDetailsContent({ collectionId }: { collectionId: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const [collection, setCollection] = useState<CollectionSummary | null>(null);
  const [books, setBooks] = useState<SavedBookCardData[]>([]);
  const [ratings, setRatings] = useState<Map<string, number>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [actions, setActions] = useState<Record<number, "remove" | "status">>(
    {},
  );
  const [removalErrors, setRemovalErrors] = useState<Record<number, string>>(
    {},
  );
  const [statusErrors, setStatusErrors] = useState<Record<number, string>>({});
  const busyIds = useRef(new Set<number>());
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCollection() {
      setLoading(true);
      setLoadError("");
      setUnavailable(false);
      try {
        const data = await getCollection(collectionId, controller.signal);
        const [withDetails, userRatings] = await Promise.all([
          Promise.all(
            data.books.map(async (book) => {
              try {
                return {
                  ...book,
                  details: await getBookDetails(
                    book.bookKey,
                    controller.signal,
                  ),
                };
              } catch {
                return { ...book, details: null };
              }
            }),
          ),
          getRatings(controller.signal).catch(() => []),
        ]);
        if (controller.signal.aborted) return;
        setCollection(data.collection);
        setBooks(withDetails);
        setRatings(
          new Map(userRatings.map((rating) => [rating.bookKey, rating.rating])),
        );
        setRemovalErrors({});
        setStatusErrors({});
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not load this collection.",
        );
        if (error instanceof ApiRequestError) {
          setUnavailable(error.status === 400 || error.status === 404);
          if (error.status === 401) setSessionExpired(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadCollection();
    return () => controller.abort();
  }, [collectionId, attempt]);

  function beginAction(id: number, action: "remove" | "status") {
    if (busyIds.current.has(id) || loading || sessionExpired) return false;
    busyIds.current.add(id);
    setActions((current) => ({ ...current, [id]: action }));
    setNotice("");
    return true;
  }

  function finishAction(id: number) {
    busyIds.current.delete(id);
    if (mounted.current)
      setActions((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
  }

  function handleMissingOrExpired(error: unknown) {
    if (!(error instanceof ApiRequestError)) return false;
    if (error.status === 401) {
      setSessionExpired(true);
      return true;
    }
    if (error.status === 404) {
      setNotice("Collection contents have changed.");
      setAttempt((current) => current + 1);
      return true;
    }
    return false;
  }

  async function handleRemoveFromCollection(book: SavedBookCardData) {
    if (!beginAction(book.id, "remove")) return;
    setRemovalErrors((current) => ({ ...current, [book.id]: "" }));
    const title = book.details?.title ?? "Book details unavailable";
    try {
      await removeBookFromCollection(collectionId, book.id);
      if (!mounted.current) return;
      setBooks((current) => current.filter((item) => item.id !== book.id));
      setNotice(
        `Removed “${title}” from “${collection?.name}”. It remains in My Library.`,
      );
    } catch (error) {
      if (mounted.current && !handleMissingOrExpired(error))
        setRemovalErrors((current) => ({
          ...current,
          [book.id]:
            error instanceof Error
              ? error.message
              : "Could not remove this book from the collection.",
        }));
    } finally {
      finishAction(book.id);
    }
  }

  async function handleReadingStatusChange(
    book: SavedBookCardData,
    status: SavedBookCardData["readingStatus"],
  ) {
    if (!beginAction(book.id, "status")) return;
    const previousStatus = book.readingStatus;
    setStatusErrors((current) => ({ ...current, [book.id]: "" }));
    setBooks((current) =>
      current.map((item) =>
        item.id === book.id ? { ...item, readingStatus: status } : item,
      ),
    );
    try {
      const savedStatus = await updateReadingStatus(book.id, status);
      if (mounted.current)
        setBooks((current) =>
          current.map((item) =>
            item.id === book.id
              ? { ...item, readingStatus: savedStatus.readingStatus }
              : item,
          ),
        );
    } catch (error) {
      if (!mounted.current) return;
      setBooks((current) =>
        current.map((item) =>
          item.id === book.id
            ? { ...item, readingStatus: previousStatus }
            : item,
        ),
      );
      if (!handleMissingOrExpired(error))
        setStatusErrors((current) => ({
          ...current,
          [book.id]: errorMessage(error, {
            fallback: "Could not update this book's reading status.",
          }),
        }));
    } finally {
      finishAction(book.id);
    }
  }

  async function logInAgain() {
    try {
      await logout();
      const state: AuthLocationState = { from: location };
      void navigate("/login", { state, replace: true });
    } catch {
      if (mounted.current) setLoginError("Could not open the login page.");
    }
  }

  function viewBook(bookKey: string) {
    const state: BookDetailsLocationState = {
      backLabel: `Back to ${collection?.name}`,
    };
    void navigate(bookDetailsPath(bookKey), { state });
  }

  return (
    <CollectionShell>
      <header className="collection-details-heading">
        <h1>
          {unavailable
            ? "Collection unavailable"
            : (collection?.name ?? "Collection")}
        </h1>
        {collection && !loading && !loadError && (
          <p>
            {books.length} {books.length === 1 ? "book" : "books"}
          </p>
        )}
      </header>
      {sessionExpired && (
        <div role="alert">
          <p>Your session has expired. Please log in again.</p>
          <button type="button" onClick={() => void logInAgain()}>
            Log in again
          </button>
        </div>
      )}
      {loginError && <p role="alert">{loginError}</p>}
      {loading ? (
        <p role="status">Loading collection…</p>
      ) : loadError ? (
        !sessionExpired && (
          <div role="alert">
            <p>{loadError}</p>
            {!unavailable && !sessionExpired && (
              <button
                type="button"
                onClick={() => setAttempt((current) => current + 1)}
              >
                Try again
              </button>
            )}
          </div>
        )
      ) : books.length === 0 ? (
        <div className="collection-empty-state">
          <h2>No books in this collection yet</h2>
          <p>Add books from their details pages.</p>
          <Link to="/search">Discover books</Link>
        </div>
      ) : (
        <ul className="saved-book-grid" aria-label="Collection books">
          {books.map((book) => (
            <SavedBookCard
              key={book.id}
              book={book}
              rating={ratings.get(book.bookKey)}
              removeFrom="collection"
              onViewBook={() => viewBook(book.bookKey)}
              onReadingStatusChange={(status) =>
                void handleReadingStatusChange(book, status)
              }
              onRemove={() => void handleRemoveFromCollection(book)}
              isRemoving={actions[book.id] === "remove"}
              isUpdatingReadingStatus={actions[book.id] === "status"}
              readingStatusError={statusErrors[book.id]}
              removalError={removalErrors[book.id]}
              disabled={sessionExpired}
            />
          ))}
        </ul>
      )}
      {notice && (
        <p className="collection-notice" role="status">
          {notice}
        </p>
      )}
    </CollectionShell>
  );
}
