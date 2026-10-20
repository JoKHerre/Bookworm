import { useState } from "react";
import type { BookSearchResponse, BookSearchResult } from "../../shared/books";
import BookCard from "../components/BookCard";
import BookDetailsPage from "./BookDetailsPage";
import "./SearchPage.css";

type ViewMode = "grid" | "list";

function SearchPage() {
  const [query, setQuery] = useState("");
  const [books, setBooks] = useState<BookSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedBookKey, setSelectedBookKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  async function handleSearch(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!query.trim()) {
      setError("");
      setBooks([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setError("");
    setSearched(true);
    setSelectedBookKey(null);

    try {
      const response = await fetch(
        `/api/books/search?q=${encodeURIComponent(query.trim())}`,
      );

      if (!response.ok) {
        throw new Error("Search failed.");
      }

      const data: BookSearchResponse = await response.json();
      setBooks(data.books ?? []);
    } catch (err) {
      console.error("Book search error:", err);
      setError("Unable to search for books. Please try again.");
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }

  if (selectedBookKey) {
    return (
      <BookDetailsPage
        bookKey={selectedBookKey}
        onBack={() => setSelectedBookKey(null)}
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
              {books.length} {books.length === 1 ? "book" : "books"} found
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
                  onClick={() => setSelectedBookKey(book.key)}
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
                  onClick={() => setSelectedBookKey(book.key)}
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
