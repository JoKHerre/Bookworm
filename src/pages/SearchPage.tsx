import { useEffect, useRef, useState } from "react";
import type { BookSearchResult } from "../../shared/books";
import { searchBooks } from "../booksApi";
import BookCard from "../components/BookCard";
import BookDetailsPage from "./BookDetailsPage";
import "./SearchPage.css";

type ViewMode = "grid" | "list";

function SearchPage() {
  const [query, setQuery] = useState("");
  const [books, setBooks] = useState<BookSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedBook, setSelectedBook] = useState<BookSearchResult | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function handleSearch(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;

    if (!query.trim()) {
      setLoading(false);
      setError("");
      setBooks([]);
      setTotal(0);
      setSearched(false);
      return;
    }

    setLoading(true);
    setError("");
    setSearched(true);
    setSelectedBook(null);

    try {
      const data = await searchBooks(query.trim(), controller.signal);
      if (!controller.signal.aborted) {
        setBooks(data.books);
        setTotal(data.total);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof Error ? err.message : "Unable to search for books",
      );
      setBooks([]);
      setTotal(0);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  if (selectedBook) {
    return (
      <BookDetailsPage
        key={selectedBook.key}
        bookKey={selectedBook.key}
        searchBook={selectedBook}
        onBack={() => setSelectedBook(null)}
      />
    );
  }

  return (
    <main className="search-page">
      <section className="search-intro">
        <form className="book-search-form" onSubmit={handleSearch}>
          <div className="search-form-inner">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title or author..."
              aria-label="Search by title or author"
            />

            <button type="submit" disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </form>
      </section>

      {error && <p className="search-message search-message--error">{error}</p>}

      {loading && <p className="search-message">Searching for books...</p>}

      {!loading && !error && searched && books.length === 0 && (
        <p className="search-message">No results.</p>
      )}

      {!loading && !error && books.length > 0 && (
        <>
          <div className="search-results-toolbar">
            <p className="search-results-count">
              Showing {books.length} of {total}{" "}
              {total === 1 ? "result" : "results"}
            </p>

            <div
              className="view-toggle"
              role="group"
              aria-label="Choose results layout"
            >
              <button
                type="button"
                className={viewMode === "grid" ? "active" : ""}
                onClick={() => setViewMode("grid")}
                aria-pressed={viewMode === "grid"}
              >
                Grid
              </button>

              <button
                type="button"
                className={viewMode === "list" ? "active" : ""}
                onClick={() => setViewMode("list")}
                aria-pressed={viewMode === "list"}
              >
                List
              </button>
            </div>
          </div>

          {viewMode === "grid" ? (
            <section className="book-grid" aria-label="Book search results">
              {books.map((book) => (
                <BookCard
                  key={book.key}
                  book={book}
                  onClick={() => setSelectedBook(book)}
                />
              ))}
            </section>
          ) : (
            <section className="book-list" aria-label="Book search results">
              {books.map((book) => (
                <button
                  key={book.key}
                  type="button"
                  className="book-list-item"
                  onClick={() => setSelectedBook(book)}
                  aria-label={`View details for ${book.title} by ${
                    book.author_name?.join(", ") || "Unknown author"
                  }`}
                >
                  {book.cover_i ? (
                    <img
                      className="book-list-cover"
                      src={`https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`}
                      alt=""
                      aria-hidden="true"
                    />
                  ) : (
                    <div
                      className="book-list-cover book-list-cover--placeholder"
                      aria-hidden="true"
                    />
                  )}

                  <div className="book-list-info" aria-hidden="true">
                    <h2>{book.title}</h2>

                    <p className="book-list-author">
                      {book.author_name?.join(", ") || "Unknown author"}
                    </p>

                    {book.first_publish_year && (
                      <p className="book-list-year">
                        {book.first_publish_year}
                      </p>
                    )}
                  </div>

                  <span className="book-list-action" aria-hidden="true">
                    View details →
                  </span>
                </button>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default SearchPage;
