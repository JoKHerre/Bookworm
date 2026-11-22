import { ApiRequestError } from "../api/client";
import type { SavedBook } from "../../shared/library";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  addBookToCollection,
  listCollectionsForBook,
  type CollectionMembershipSummary,
} from "../api/collections";
import "./BookCollectionAssignment.css";

interface Props {
  bookKey: string;
  title: string;
  onAdded?: (book: SavedBook) => void;
  onLogin: () => void | Promise<void>;
}

// The parent keys this component by book and user to reset private state on navigation.
export default function BookCollectionAssignment({
  bookKey,
  title,
  onLogin,
  onAdded,
}: Props) {
  const id = useId();
  const [collections, setCollections] = useState<CollectionMembershipSummary[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [pending, setPending] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const mounted = useRef(false);
  const busy = useRef(false);
  const expired = useRef(false);
  const activeLoad = useRef<AbortController | null>(null);
  const reload = useRef<((background: boolean) => void) | null>(null);
  const deferredRefresh = useRef<boolean | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let usable = false;
    async function loadAssignmentData(background: boolean) {
      if (expired.current) return;
      if (busy.current) {
        // A required recovery refresh takes priority over a background refresh.
        deferredRefresh.current =
          deferredRefresh.current === false ? false : background;
        return;
      }
      activeLoad.current?.abort();
      const controller = new AbortController();
      activeLoad.current = controller;
      const quiet = background && usable;
      if (!quiet) {
        usable = false;
        setLoading(true);
      }
      setLoadError("");
      setRefreshError("");
      try {
        const result = await listCollectionsForBook(bookKey, controller.signal);
        if (controller.signal.aborted) return;
        usable = true;
        setCollections(result);
        setSelectedId((current) =>
          result.some(
            (collection) =>
              String(collection.id) === current && !collection.containsBook,
          )
            ? current
            : "",
        );
      } catch (failure) {
        if (controller.signal.aborted) return;
        const message =
          failure instanceof Error
            ? failure.message
            : "Could not load your collections.";
        if (quiet) setRefreshError(message);
        else setLoadError(message);
        if (failure instanceof ApiRequestError && failure.status === 401) {
          expired.current = true;
          setSessionExpired(true);
        }
      } finally {
        if (activeLoad.current === controller) activeLoad.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    reload.current = (background) => {
      void loadAssignmentData(background);
    };
    function onVisibilityChange() {
      if (document.visibilityState === "visible") void loadAssignmentData(true);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    void loadAssignmentData(false);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      activeLoad.current?.abort();
      activeLoad.current = null;
      reload.current = null;
      deferredRefresh.current = null;
    };
  }, [bookKey]);

  async function handleAddToCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const collection = collections.find(
      (item) => String(item.id) === selectedId && !item.containsBook,
    );
    if (!collection || busy.current || loading || loadError || sessionExpired)
      return;
    busy.current = true;
    // A response started before this mutation must not overwrite its membership.
    if (activeLoad.current) {
      activeLoad.current.abort();
      activeLoad.current = null;
      deferredRefresh.current = true;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      const savedBook = await addBookToCollection(collection.id, bookKey);
      if (!mounted.current) return;
      onAdded?.(savedBook);
      setCollections((current) =>
        current.map((item) =>
          item.id === collection.id
            ? { ...item, containsBook: true, bookCount: item.bookCount + 1 }
            : item,
        ),
      );
      setSelectedId("");
      setNotice(`Added “${title}” to “${collection.name}”.`);
    } catch (failure) {
      if (!mounted.current) return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not add this book to the collection.",
      );
      if (failure instanceof ApiRequestError) {
        if (failure.status === 401) {
          expired.current = true;
          setSessionExpired(true);
        }
        if (failure.status === 404 || failure.status === 409) {
          setSelectedId("");
          reload.current?.(false);
        }
      }
    } finally {
      busy.current = false;
      if (mounted.current) {
        setPending(false);
        const background = deferredRefresh.current;
        deferredRefresh.current = null;
        if (background !== null) reload.current?.(background);
      }
    }
  }

  return (
    <section className="book-collection-assignment" aria-label="Collections">
      <h3>Add to a collection</h3>
      {loading && <p role="status">Loading collections…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {refreshError && <p role="alert">{refreshError}</p>}
      {error && <p role="alert">{error}</p>}
      {sessionExpired ? (
        <button
          type="button"
          onClick={() => {
            void Promise.resolve()
              .then(onLogin)
              .catch(() => {
                if (mounted.current) setError("Could not open the login page.");
              });
          }}
        >
          Log in again
        </button>
      ) : loadError ? (
        <button type="button" onClick={() => reload.current?.(false)}>
          Try again
        </button>
      ) : (
        !loading && (
          <>
            {collections.length === 0 ? (
              <p>
                No collections yet. Create one in My Library to organize this
                book.
              </p>
            ) : (
              <form
                onSubmit={(event) => void handleAddToCollection(event)}
                aria-label="Add book to collection"
                aria-busy={pending}
              >
                <label
                  className="book-collection-label"
                  htmlFor={`${id}-collection`}
                >
                  Collection
                </label>
                <select
                  id={`${id}-collection`}
                  value={selectedId}
                  disabled={pending}
                  onChange={(event) => {
                    setSelectedId(event.target.value);
                    setError("");
                    setNotice("");
                  }}
                >
                  <option value="">Choose a collection</option>
                  {collections.map((collection) => (
                    <option
                      key={collection.id}
                      value={collection.id}
                      disabled={collection.containsBook}
                    >
                      {collection.name}
                      {collection.containsBook ? " — Already added" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  aria-label={pending ? "Adding…" : "Add to collection"}
                  disabled={pending || !selectedId}
                >
                  {pending ? "Adding…" : "Add"}
                </button>
              </form>
            )}
            <div className="book-collection-links">
              <Link to="/personal-library?tab=collections">
                Manage collections in My Library
              </Link>
            </div>
            {refreshError && (
              <button
                type="button"
                disabled={pending}
                onClick={() => reload.current?.(true)}
              >
                Try again
              </button>
            )}
          </>
        )
      )}
      {pending && (
        <p className="visually-hidden" role="status">
          Adding book to collection…
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
