import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import type { AvailabilityResponse } from "../../shared/availability";
import type { BookDetails } from "../../shared/books";
import { getBookDetails, getBookAvailability } from "../booksApi";
import BookISBNSection from "../components/BookISBNSection";
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

  const [availability, setAvailability] = useState<AvailabilityResponse>();
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);

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

    getBookAvailability(bookKey, signal)
      .then((data) => {
        if (!signal.aborted) setAvailability(data);
      })
      .catch((err) => {
        if (!signal.aborted) {
          setAvailabilityError(
            err instanceof Error ? err.message : "Unable to check availability",
          );
        }
      });

    return () => controller.abort();
  }, [bookKey, loading, book, availabilityAttempt]);
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

  function retryAvailability() {
    setAvailability(undefined);
    setAvailabilityError(null);
    setAvailabilityAttempt((attempt) => attempt + 1);
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
  const catalogRecord =
    availability?.status === "matched" ? availability.availability : null;
  const branches = Object.entries(catalogRecord?.branches ?? {});
  const catalogMetadata = [catalogRecord?.author, catalogRecord?.format]
    .filter(Boolean)
    .join(" ·  ");
  const canRetryAvailability =
    Boolean(availabilityError) ||
    (availability?.status === "incomplete" &&
      availability.reason === "deadline");

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
            <h2>Tags</h2>

            {book.tags.length > 0 ? (
              <div className="genre-list">
                {book.tags.map((tag) => (
                  <span className="genre-tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p>No tags available.</p>
            )}
          </section>
        </>
      )}

      {book && (
        <section className="library-availability">
          <h2>Library Availability</h2>
          <div className="library-availability-content">
            {availabilityError ? (
              <p role="alert">{availabilityError}</p>
            ) : availability === undefined ? (
              <p role="status">Checking library...</p>
            ) : availability.status === "not_found" ? (
              <p>
                {availability.reason === "no_isbns"
                  ? "No ISBNs are available to check this book in the library catalog."
                  : "No catalog match was found for the ISBNs checked."}
              </p>
            ) : availability.status === "incomplete" ? (
              <p role="status">
                {availability.reason === "deadline"
                  ? "The library catalog check took too long to finish. A match may still exist."
                  : "The library catalog check is incomplete. A match may still exist."}
              </p>
            ) : catalogRecord ? (
              <>
                <div className="library-record">
                  <p className="library-record-title">
                    <a
                      href={`https://catalog.santacruzpl.org/polaris/search/title.aspx?ctx=1.1033.0.0.1&cn=${encodeURIComponent(catalogRecord.bibid)}`}
                    >
                      {catalogRecord.title}
                    </a>
                  </p>
                  {catalogMetadata && (
                    <p className="library-record-meta">{catalogMetadata}</p>
                  )}
                </div>
                {branches.length === 0 ? (
                  <p>
                    Branch availability is not reported for this catalog record.
                  </p>
                ) : (
                  <ul className="branches">
                    {branches.map(([name, branch]) => (
                      <li key={name}>
                        {name}: {branch.available} of {branch.total} available
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
            {canRetryAvailability && (
              <button
                className="availability-retry-button"
                type="button"
                onClick={retryAvailability}
              >
                Retry
              </button>
            )}
          </div>
        </section>
      )}

      {book && <BookISBNSection bookKey={bookKey} />}
    </main>
  );
}

export default BookDetailsPage;
