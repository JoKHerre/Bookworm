import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { BookSearchResult } from "../../shared/books";
import { searchBooks } from "../booksApi";
import BookCard from "../components/BookCard";
import { bookDetailsPath, type BookDetailsLocationState } from "../routes";
import "./SearchPage.css";

type ViewMode = "grid" | "list";

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const submittedQuery = searchParams.get("q") ?? "";
  const navigate = useNavigate();

  const [books, setBooks] = useState<BookSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const searched = submittedQuery !== "";
  const visibleBooks = searched ? books : [];
  const visibleError = searched ? error : "";
  const visibleLoading = searched && loading;

  useEffect(() => {
    if (!submittedQuery) return;

    const controller = new AbortController();
    const { signal } = controller;

    async function search() {
      setLoading(true);
      setError("");

      try {
        const data = await searchBooks(submittedQuery, signal);
        if (!signal.aborted) {
          setBooks(data.books);
          setTotal(data.total);
        }
      } catch (err) {
        if (signal.aborted) return;
        setError(
          err instanceof Error ? err.message : "Unable to search for books",
        );
        setBooks([]);
        setTotal(0);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    void search();
    return () => controller.abort();
  }, [submittedQuery, searchAttempt]);

  function handleSearch(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const trimmed = String(formData.get("q") ?? "").trim();
    if (trimmed === submittedQuery) {
      setSearchAttempt((attempt) => attempt + 1);
    } else {
      setSearchParams(trimmed ? { q: trimmed } : {});
    }
  }

  function viewBook(book: BookSearchResult) {
    const state: BookDetailsLocationState = {
      backLabel: "Back to Search",
      searchBook: book,
    };
    void navigate(bookDetailsPath(book.key), { state });
  }

  return (
    <main className="search-page">
      <section className="search-intro">
        <form className="book-search-form" onSubmit={handleSearch}>
          <div className="search-form-inner">
            <input
              type="search"
              key={submittedQuery}
              name="q"
              defaultValue={submittedQuery}
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
              Showing {visibleBooks.length} of {total}{" "}
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
              {visibleBooks.map((book) => (
                <BookCard
                  key={book.key}
                  book={book}
                  onClick={() => viewBook(book)}
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
                  onClick={() => viewBook(book)}
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
