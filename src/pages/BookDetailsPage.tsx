import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import type { BookISBNs, BookDetails } from "../../shared/books";
import { getBookDetails, getBookISBNs, getBookAvailability } from "../booksApi";
import type { AuthLocationState, BookDetailsLocationState } from "../routes";
import { useAuth } from "../useAuth";
import "./BookDetailsPage.css";

function BookDetailsPage() {
  const params = useParams();
  const bookKey = `/${params["*"] ?? ""}`;

  // Reset the BookDetailsContent component whenever the bookKey changes.
  return <BookDetailsContent key={bookKey} bookKey={bookKey} />;
}

function BookDetailsContent({ bookKey }: { bookKey: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const backLabel =
    (location.state as BookDetailsLocationState | null)?.backLabel ?? "Back";

  const state = location.state as BookDetailsLocationState | null;
  const searchBook =
    state?.searchBook?.key === bookKey ? state.searchBook : undefined;

  function onBack() {
    if (location.key === "default") {
      navigate("/search");
    } else {
      navigate(-1);
    }
  }

  const [book, setBook] = useState<BookDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false); // used to control save button's availability
  const [saveMessage, setSaveMessage] = useState(""); // used to display message to user after attempting to save a book
  const [isbns, setISBNs] = useState<BookISBNs | null>(null);
  const [isbnError, setISBNError] = useState<string | null>(null);

  const [availability, setAvailability] = useState<
  Awaited<ReturnType<typeof getBookAvailability>>["availability"] | undefined >(undefined);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    getBookDetails(bookKey, signal, !searchBook?.author_name?.length)
      .then((data) => {
        if (!signal.aborted) setBook(data);
      })
      .catch((err) => {
        if (!signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Unable to load book details",
          );
        }
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [bookKey, searchBook]);

  useEffect(() => {
    if (loading || !book) return;
    const controller = new AbortController();
    const { signal } = controller;

    getBookISBNs(bookKey, signal)
      .then((data) => {
        if (!signal.aborted) setISBNs(data);
      })
      .catch((err) => {
        if (!signal.aborted) {
          setISBNError(
            err instanceof Error ? err.message : "Unable to load ISBNs",
          );
        }
      });

    return () => controller.abort();
  }, [bookKey, loading, book]);

  useEffect(() => {
    if (loading || !book) return;
    const controller = new AbortController();
    const { signal } = controller;

    getBookAvailability(bookKey, signal)
      .then((data) => {
        if (!signal.aborted) setAvailability(data.availability);
      })
      .catch((err) => {
        if (!signal.aborted) {
          setAvailabilityError(
            err instanceof Error ? err.message : "Unable to check availability",
          );
        }
      });

    return () => controller.abort();
  }, [bookKey, loading, book]);

  function goToLogin() {
    const state: AuthLocationState = { from: location };
    void navigate("/login", { state, replace: true });
  }

  // function to handle saving a book to the user's personal library
  async function handleSave() {
    // set saving state to true and clear any previous save message
    setSaving(true);
    setSaveMessage("");

    try {
      // send POST request with the bookKey to /api/library
      const response = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookKey }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      // interpret response status + show appropriate message to user through saveMessage
      if (response.status === 201) {
        // success
        setSaveMessage("Book saved to your library.");
      } else if (response.status === 409) {
        // duplicate conflict
        setSaveMessage("This book is already in your library.");
      } else if (response.status === 401) {
        // unauthorized user
        setSaveMessage("Please sign in to save books to your library.");
      } else {
        // other error: generic error msg
        setSaveMessage(
          data.error ?? "Could not save this book. Please try again.",
        );
      }
    } catch {
      // network or other error: generic error msg
      setSaveMessage("Could not save this book. Please try again.");
    } finally {
      // re-enable save button after request is complete, by setting saving to false
      setSaving(false);
    }
  }

  const summary =
    typeof book?.description === "string"
      ? book.description
      : book?.description?.value;

  const coverId = book?.covers?.[0] ?? searchBook?.cover_i;
  const coverUrl = coverId
    ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
    : null;

  const title = book?.title ?? searchBook?.title ?? "Book details";

  const isbn13List = isbns?.isbn_13 ?? [];
  const isbn10List = isbns?.isbn_10 ?? [];
  const totalIsbns = isbn13List.length + isbn10List.length;

  return (
    <main className="book-details" aria-busy={loading}>
      <button className="back-button" onClick={onBack}>
        {backLabel}
      </button>

      <section className="book-header">
        {coverUrl && (
          <img
            className="book-cover"
            src={coverUrl}
            alt={`Cover of ${title}`}
          />
        )}

        <div className="book-info">
          <h1 className="book-details-title">{title}</h1>

          <p className="book-details-author">
            {searchBook?.author_name?.join(", ") ||
              book?.authors.join(", ") ||
              "Unknown author"}
          </p>
          {user ? (
            <button
              className="save-library-button"
              type="button"
              onClick={handleSave}
              disabled={saving || loading || !book}
            >
              {saving ? "Saving..." : "Save to My Library"}
            </button>
          ) : (
            <button
              className="save-library-button"
              type="button"
              onClick={goToLogin}
            >
              Log in to save
            </button>
          )}
          {saveMessage && <p role="status">{saveMessage}</p>}
        </div>
      </section>

      {error && <p role="alert">{error}</p>}

      {book && (
        <>
          <section className="book-summary">
            <h2>Summary</h2>
            <p>{summary || "No summary available."}</p>
          </section>

          <section className="book-genres">
            <h2>Genres</h2>

            {book.subjects && book.subjects.length > 0 ? (
              <div className="genre-list">
                {book.subjects.slice(0, 10).map((subject) => (
                  <span className="genre-tag" key={subject}>
                    {subject}
                  </span>
                ))}
              </div>
            ) : (
              <p>No genres or subjects available.</p>
            )}
          </section>
        </>
      )}


{book && (
  <section className="library-availability">
    <h2>Library Availability</h2>
    {availabilityError ? (
      <p role="alert">{availabilityError}</p>
    ) : availability === undefined ? (
      <p role="status">Checking library...</p>
    ) : availability === null ? (
      <p>Not found in the library catalog.</p>
    ) : (
      <ul className="branches">
        {Object.entries(availability.branches).map(([name, b]) => (
          <li key={name}>
            {name}: {b.available} of {b.total} available
          </li>
        ))}
      </ul>
    )}
  </section>
)}

      {book && (
        <section className="book-isbns">
          <h2>ISBNs</h2>
          <details>
            <summary>Show all{isbns ? ` (${totalIsbns})` : ""}</summary>

            {isbnError ? (
              <p role="alert">{isbnError}</p>
            ) : !isbns ? (
              <p role="status">Loading ISBNs...</p>
            ) : totalIsbns > 0 ? (
              <div className="isbn-columns">
                {isbn13List.length > 0 && (
                  <div className="isbn-group">
                    <h3>ISBN-13 ({isbn13List.length})</h3>
                    <ul>
                      {isbn13List.map((isbn) => (
                        <li key={`isbn13-${isbn}`}>{isbn}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {isbn10List.length > 0 && (
                  <div className="isbn-group">
                    <h3>ISBN-10 ({isbn10List.length})</h3>
                    <ul>
                      {isbn10List.map((isbn) => (
                        <li key={`isbn10-${isbn}`}>{isbn}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p>No ISBNs available for this book.</p>
            )}
          </details>
        </section>
      )}
    </main>
  );
}

export default BookDetailsPage;
