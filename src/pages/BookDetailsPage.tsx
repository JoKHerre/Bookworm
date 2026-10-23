import { useEffect, useState } from "react";
import type {
  BookISBNs,
  BookDetails,
  BookSearchResult,
} from "../../shared/books";
import { getBookDetails, getBookISBNs } from "../booksApi";
import "./BookDetailsPage.css";

interface BookDetailsPageProps {
  searchBook: BookSearchResult;
  onBack: () => void;
}

function BookDetailsPage({ searchBook, onBack }: BookDetailsPageProps) {
  const bookKey = searchBook.key;
  const [book, setBook] = useState<BookDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isbns, setISBNs] = useState<BookISBNs | null>(null);
  const [isbnError, setISBNError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    getBookDetails(bookKey, signal)
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
  }, [bookKey]);

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

  const summary =
    typeof book?.description === "string"
      ? book.description
      : book?.description?.value;

  const coverId = book?.covers?.[0] ?? searchBook.cover_i;
  const coverUrl = coverId
    ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
    : null;

  const title = book?.title ?? searchBook.title;

  const isbn13List = isbns?.isbn_13 ?? [];
  const isbn10List = isbns?.isbn_10 ?? [];
  const totalIsbns = isbn13List.length + isbn10List.length;

  return (
    <main className="book-details" aria-busy={loading}>
      <button className="back-button" onClick={onBack}>
        Back to Search
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
            {searchBook.author_name?.join(", ") || "Unknown author"}
          </p>
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
