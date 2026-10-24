import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { BookSearchResponse, BookSearchResult } from "../../shared/books";
import BookCard from "../components/BookCard";
import { bookDetailsPath, type BookDetailsLocationState } from "../routes";
import "./SearchPage.css";

type ViewMode = "grid" | "list";

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const submittedQuery = searchParams.get("q") ?? "";
  const navigate = useNavigate();

  const [query, setQuery] = useState(submittedQuery);
  const [books, setBooks] = useState<BookSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const searched = submittedQuery !== "";
  const visibleBooks = searched ? books : [];
  const visibleError = searched ? error : "";
  const visibleLoading = searched && loading;

  useEffect(() => {
    if (!submittedQuery) return;

    let isCurrentRequest = true;

    async function search() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/books/search?q=${encodeURIComponent(submittedQuery)}`,
        );

        if (!response.ok) {
          throw new Error("Search failed.");
        }

        const data: BookSearchResponse = await response.json();
        if (isCurrentRequest) setBooks(data.books ?? []);
      } catch (err) {
        console.error("Book search error:", err);
        if (isCurrentRequest) {
          setError("Unable to search for books. Please try again.");
          setBooks([]);
        }
      } finally {
        if (isCurrentRequest) setLoading(false);
      }
    }

    search();

    return () => {
      isCurrentRequest = false;
    };
  }, [submittedQuery]);

  function handleSearch(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    setSearchParams(trimmed ? { q: trimmed } : {});
  }

  function viewBook(bookKey: string) {
    const state: BookDetailsLocationState = { backLabel: "Back to Search" };
    void navigate(bookDetailsPath(bookKey), { state });
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

            <button type="submit" disabled={visibleLoading}>
              {visibleLoading ? "Searching..." : "Search"}
            </button>
          </div>
        </form>
      </section>

      {visibleError && (
        <p className="search-message search-message--error">{visibleError}</p>
      )}

      {visibleLoading && (
        <p className="search-message">Searching for books...</p>
      )}

      {!visibleLoading &&
        !visibleError &&
        searched &&
        visibleBooks.length === 0 && (
          <p className="search-message">No results.</p>
        )}

      {!visibleLoading && !visibleError && visibleBooks.length > 0 && (
        <>
          <div className="search-results-toolbar">
            <p className="search-results-count">
              {visibleBooks.length}{" "}
              {visibleBooks.length === 1 ? "book" : "books"} found
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
              {visibleBooks.map((book) => (
                <BookCard
                  key={book.key}
                  book={book}
                  onClick={() => viewBook(book.key)}
                />
              ))}
            </section>
          ) : (
            <section className="book-list" aria-label="Book search results">
              {visibleBooks.map((book) => (
                <button
                  key={book.key}
                  type="button"
                  className="book-list-item"
                  onClick={() => viewBook(book.key)}
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
