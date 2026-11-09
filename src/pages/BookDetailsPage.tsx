import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import type {
  BookISBNs,
  BookISBNsQuery,
  BookDetails,
} from "../../shared/books";
import { getBookDetails, getBookISBNs } from "../booksApi";
import type { AuthLocationState, BookDetailsLocationState } from "../routes";
import { getRatings, saveRating } from "../ratingsApi";
import StarRating from "../components/StarRating";
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
  const [rating, setRating] = useState<number | null>(null); // the signed-in user's rating of this book
  const [ratingSaving, setRatingSaving] = useState(false); // used to disable the rating control during a request
  const [ratingMessage, setRatingMessage] = useState(""); // message shown after attempting to save a rating
  const [isbnLanguage, setISBNLanguage] =
    useState<BookISBNsQuery["language"]>("eng");
  const [isbns, setISBNs] = useState<BookISBNs | null>(null);
  const [isbnError, setISBNError] = useState<string | null>(null);

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

    getBookISBNs(bookKey, signal, isbnLanguage)
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
  }, [bookKey, loading, book, isbnLanguage]);

  // load the signed-in user's existing rating for this book, if any
  const userId = user?.id;
  useEffect(() => {
    if (userId === undefined) return;
    const controller = new AbortController();

    getRatings(controller.signal)
      .then((ratings) => {
        const existing = ratings.find((r) => r.bookKey === bookKey);
        // don't overwrite a rating the user has already picked while this loaded
        if (existing) setRating((current) => current ?? existing.rating);
      })
      .catch(() => {
        // a missing rating just leaves the control empty
      });

    return () => controller.abort();
  }, [bookKey, userId]);

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

  // function to handle rating a book: optimistically show the new rating, roll back if saving fails
  async function handleRate(newRating: number) {
    const previousRating = rating;
    setRating(newRating);
    setRatingSaving(true);
    setRatingMessage("");

    try {
      await saveRating(bookKey, newRating);
      setRatingMessage("Rating saved.");
    } catch (err) {
      setRating(previousRating);
      setRatingMessage(
        err instanceof Error
          ? err.message
          : "Could not save your rating. Please try again.",
      );
    } finally {
      setRatingSaving(false);
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
          {user && (
            <>
              <StarRating
                value={rating}
                onChange={(value) => void handleRate(value)}
                disabled={ratingSaving || loading || !book}
              />
              {ratingMessage && <p role="status">{ratingMessage}</p>}
            </>
          )}
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
        <section className="book-isbns">
          <h2>ISBNs</h2>
          <details>
            <summary>Show ISBNs{isbns ? ` (${totalIsbns})` : ""}</summary>

            <label className="isbn-language-filter">
              Edition language
              <select
                value={isbnLanguage}
                aria-describedby="isbn-language-help"
                onChange={(event) => {
                  const language = event.target.value;
                  if (language !== "eng" && language !== "all") return;
                  setISBNLanguage(language);
                  setISBNs(null);
                  setISBNError(null);
                }}
              >
                <option value="eng">English</option>
                <option value="all">All languages</option>
              </select>
            </label>
            <p id="isbn-language-help">
              All languages includes editions without language information.
            </p>

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
              <p>
                {isbnLanguage === "eng"
                  ? "No ISBNs available for editions marked as English."
                  : "No ISBNs available for this book."}
              </p>
            )}
          </details>
        </section>
      )}
    </main>
  );
}

export default BookDetailsPage;
