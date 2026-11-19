import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  libraryCatalogRecordUrl,
  type AvailabilityResponse,
} from "../../shared/availability";
import type { BookDetails } from "../../shared/books";
import { getBookDetails, getBookAvailability } from "../api/books";
import BookISBNSection from "../components/BookISBNSection";
import type { BookDetailsLocationState } from "../routes";
import { getRatings, saveRating } from "../api/ratings";
import {
  useLoginToFinish,
  usePendingAction,
  useSavedBooks,
} from "../library/useSavedBooks";
import {
  READING_STATUS_OPTIONS,
  type ReadingStatus,
} from "../../shared/readingStatus";
import StarRating from "../components/StarRating";
import { useAuth } from "../auth/useAuth";
import "./BookDetailsPage.css";
import { summaryParagraphs } from "./bookSummary";
import SimilarAtLibrarySection from "../components/SimilarAtLibrarySection";

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
  const { saved, busyKeys, errors, save, setReadingStatus } = useSavedBooks();
  const savedBook = saved.get(bookKey);
  const savingBook = busyKeys.has(bookKey);
  const loginToFinish = useLoginToFinish();
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

    getRatings(controller.signal, bookKey)
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

  function retryAvailability() {
    setAvailability(undefined);
    setAvailabilityError(null);
    setAvailabilityAttempt((attempt) => attempt + 1);
  }

  // function to handle rating a book: optimistically show the new rating, roll back if saving fails
  async function handleRate(newRating: number) {
    if (!user) {
      loginToFinish({ pendingRating: newRating });
      return;
    }
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
        err instanceof Error ? err.message : "Could not save your rating.",
      );
    } finally {
      setRatingSaving(false);
    }
  }

  usePendingAction("pendingRating", handleRate);

  const description =
    typeof book?.description === "string"
      ? book.description
      : book?.description?.value;
  const summary = description ? summaryParagraphs(description) : [];

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
          {savedBook ? (
            <label className="saved-book-status">
              <span>In your library</span>
              <select
                value={savedBook.readingStatus}
                aria-busy={savingBook}
                disabled={savingBook}
                onChange={(event) =>
                  void setReadingStatus(
                    bookKey,
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
            </label>
          ) : (
            <button
              className="save-library-button"
              type="button"
              onClick={() => void save(bookKey)}
              disabled={savingBook || loading || !book}
            >
              {savingBook ? "Saving..." : "Save to My Library"}
            </button>
          )}
          {errors[bookKey] && <p role="alert">{errors[bookKey]}</p>}
          <StarRating
            value={rating}
            onChange={(value) => void handleRate(value)}
            disabled={ratingSaving || loading || !book}
          />
          {ratingMessage && <p role="status">{ratingMessage}</p>}
        </div>
      </section>

      {error && <p role="alert">{error}</p>}

      {book && summary.length > 0 && (
        <section className="book-summary">
          <h2>Summary</h2>
          {summary.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </section>
      )}

      {book && book.tags.length > 0 && (
        <section className="book-genres">
          <h2>Tags</h2>
          <div className="genre-list">
            {book.tags.map((tag) => (
              <span className="genre-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </section>
      )}

      {book && (
        <section className="library-availability">
          <h2>Library Availability</h2>
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
                  <a href={libraryCatalogRecordUrl(catalogRecord.bibid)}>
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
        </section>
      )}

      {book && <BookISBNSection bookKey={bookKey} />}

      {book && (
        <SimilarAtLibrarySection
          key={`${book.title}-book`}
          title={book.title}
          format="book"
          heading="Similar Books available at Santa Cruz Public Library"
        />
      )}
      {book && (
        <SimilarAtLibrarySection
          key={`${book.title}-ebook`}
          title={book.title}
          format="ebook"
          heading="Similar eBooks available at Santa Cruz Public Library"
        />
      )}
    </main>
  );
}
export default BookDetailsPage;
