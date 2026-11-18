import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CollectionApiError,
  createCollection,
  deleteCollection,
  listCollections,
  renameCollection,
  type CollectionSummary,
} from "../collectionsApi";
import "./CollectionsManager.css";

type Editor =
  | { kind: "create" }
  | { kind: "rename" | "delete"; collection: CollectionSummary };

// check collection name validity
function validateCollectionName(name: string): string {
  const length = [...name.trim()].length;
  return length < 1 || length > 100 || name.includes("\0")
    ? "Enter a name of 1–100 characters without null characters."
    : "";
}

export default function CollectionsManager() {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const mounted = useRef(false);
  const busy = useRef(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCollections() {
      setLoading(true);
      setLoadError("");
      try {
        const result = await listCollections(controller.signal);
        if (!controller.signal.aborted) setCollections(result);
      } catch (failure) {
        if (!controller.signal.aborted) {
          setLoadError(
            failure instanceof Error
              ? failure.message
              : "Could not load collections.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadCollections();
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (editor?.kind === "delete") cancelButton.current?.focus();
    else if (editor) input.current?.focus();
    else if (!pending && restoreFocus.current) {
      trigger.current?.focus();
      restoreFocus.current = false;
    }
  }, [editor, pending]);

  function openEditor(next: Editor, button: HTMLButtonElement) {
    trigger.current = button;
    setName(next.kind === "rename" ? next.collection.name : "");
    setError("");
    setNotice("");
    setEditor(next);
  }

  function closeEditor(deleted = false) {
    if (deleted) trigger.current = newButton.current;
    restoreFocus.current = true;
    setEditor(null);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || busy.current) return;
    if (editor.kind !== "delete") {
      const validation = validateCollectionName(name);
      if (validation) {
        setError(validation);
        input.current?.focus();
        return;
      }
      if (editor.kind === "rename" && name.trim() === editor.collection.name)
        return;
    }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      if (editor.kind === "delete") {
        await deleteCollection(editor.collection.id);
        if (!mounted.current) return;
        setCollections((current) =>
          current.filter(({ id }) => id !== editor.collection.id),
        );
        setNotice(
          `Deleted “${editor.collection.name}”. Its books are still in My Library.`,
        );
      } else {
        const result =
          editor.kind === "create"
            ? await createCollection(name)
            : await renameCollection(editor.collection.id, name);
        if (!mounted.current) return;
        setCollections((current) =>
          editor.kind === "create"
            ? [...current, result]
            : current.map((collection) =>
                collection.id === result.id ? result : collection,
              ),
        );
        setNotice(
          editor.kind === "create"
            ? `Created “${result.name}”.`
            : `Renamed collection to “${result.name}”.`,
        );
      }
      closeEditor(editor.kind === "delete");
    } catch (failure) {
      if (!mounted.current) return;
      const message =
        failure instanceof Error
          ? failure.message
          : "Could not save changes. Please try again.";
      if (failure instanceof CollectionApiError && failure.status === 404) {
        closeEditor(true);
        setNotice(
          "This collection is no longer available. Refreshing your collections…",
        );
        setAttempt((current) => current + 1);
      } else setError(message);
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  const form = editor && (
    <form
      className="collections-form"
      aria-label={
        editor.kind === "create"
          ? "Create collection"
          : editor.kind === "rename"
            ? `Rename ${editor.collection.name}`
            : `Delete ${editor.collection.name}`
      }
      onSubmit={(event) => void submit(event)}
      aria-busy={pending}
    >
      {editor.kind === "delete" ? (
        <p>
          Delete “{editor.collection.name}”? Its books will stay in My Library.
        </p>
      ) : (
        <>
          <label htmlFor="collection-name">Collection name</label>
          <input
            ref={input}
            id="collection-name"
            value={name}
            disabled={pending}
            aria-invalid={!!error}
            aria-describedby={
              error ? "collection-error" : "collection-name-hint"
            }
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
          />
          <p id="collection-name-hint">
            1–100 characters. Names must be unique in your collections.
          </p>
        </>
      )}
      {error && (
        <p id="collection-error" role="alert">
          {error}
        </p>
      )}
      <div className="collections-actions">
        <button
          type="submit"
          disabled={
            pending ||
            (editor.kind === "rename" && name.trim() === editor.collection.name)
          }
        >
          {pending
            ? editor.kind === "create"
              ? "Creating…"
              : editor.kind === "rename"
                ? "Saving…"
                : "Deleting…"
            : editor.kind === "create"
              ? "Create collection"
              : editor.kind === "rename"
                ? "Save changes"
                : "Delete collection"}
        </button>
        <button
          ref={cancelButton}
          type="button"
          disabled={pending}
          onClick={() => closeEditor()}
        >
          Cancel
        </button>
      </div>
      {pending && (
        <p role="status">
          {editor.kind === "delete"
            ? "Deleting collection…"
            : "Saving collection…"}
        </p>
      )}
    </form>
  );

  return (
    <section
      className="collections-manager"
      aria-labelledby="collections-title"
    >
      <div className="collections-heading">
        <div>
          <h2 id="collections-title">Collections</h2>
          <p>Collections you've created.</p>
        </div>
        <button
          ref={newButton}
          type="button"
          disabled={pending || loading || !!loadError}
          onClick={(event) =>
            openEditor({ kind: "create" }, event.currentTarget)
          }
        >
          New collection
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {loading ? (
        <p role="status">Loading collections…</p>
      ) : loadError ? (
        <div role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => setAttempt((current) => current + 1)}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {editor?.kind === "create" && form}
          {collections.length === 0 ? (
            <p>
              No collections yet. Create one to start organizing your books.
            </p>
          ) : (
            <ul className="collections-list" aria-label="Your collections">
              {collections.map((collection) => (
                <li key={collection.id}>
                  <div className="collections-row">
                    <div className="collections-summary">
                      <strong>{collection.name}</strong>
                      <span>
                        {collection.bookCount}{" "}
                        {collection.bookCount === 1 ? "book" : "books"}
                      </span>
                    </div>
                    <div className="collections-actions">
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={`Rename ${collection.name}`}
                        onClick={(event) =>
                          openEditor(
                            { kind: "rename", collection },
                            event.currentTarget,
                          )
                        }
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={`Delete ${collection.name}`}
                        onClick={(event) =>
                          openEditor(
                            { kind: "delete", collection },
                            event.currentTarget,
                          )
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {editor &&
                    editor.kind !== "create" &&
                    editor.collection.id === collection.id &&
                    form}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
