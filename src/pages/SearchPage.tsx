import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  bookSuggestionsQuery,
  type BookSearchResult,
} from "../../shared/books";
import { getBookSuggestions, searchBooks } from "../booksApi";
import BookCard from "../components/BookCard";
import { bookDetailsPath, type BookDetailsLocationState } from "../routes";
import "./SearchPage.css";

type ViewMode = "grid" | "list";

const genreOptions = [
  "Fantasy",
  "Sci-fi",
  "Mystery",
  "Romance",
  "Horror",
  "History",
  "Thriller",
  "Adventure",
  "Biography",
  "Non-fiction",
  "Poetry",
];

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
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [language, setLanguage] = useState("");
  const [publicationYearRange, setPublicationYearRange] = useState("");
  const [query, setQuery] = useState(submittedQuery);
  const [previousSubmittedQuery, setPreviousSubmittedQuery] =
    useState(submittedQuery);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<BookSearchResult[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const showList = showSuggestions && suggestions.length > 0;
  const activeSuggestion = showList
    ? suggestions[activeSuggestionIndex]
    : undefined;
  const searched = submittedQuery !== "";
  const visibleBooks = searched ? books : [];
  const visibleError = searched ? error : "";
  const visibleLoading = searched && loading;

  if (submittedQuery !== previousSubmittedQuery) {
    setPreviousSubmittedQuery(submittedQuery);
    setQuery(submittedQuery);
    setSuggestions([]);
    closeSuggestions();
  }

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

  useEffect(() => {
    if (!showSuggestions) return;

    const parsed = bookSuggestionsQuery.safeParse({ q: query });
    if (!parsed.success) return;

    const controller = new AbortController();
    const { signal } = controller;
    const timeout = window.setTimeout(() => {
      void getBookSuggestions(parsed.data.q, signal)
        .then((data) => {
          if (!signal.aborted) setSuggestions(data.books);
        })
        .catch(() => {
          if (!signal.aborted) setSuggestions([]);
        });
    }, 1000);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, showSuggestions]);

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setShowSuggestions(true);
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
  }

  function closeSuggestions() {
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
  }

  function handleSuggestionKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (!showList) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex((index) =>
        index <= 0 ? suggestions.length - 1 : index - 1,
      );
    } else if (event.key === "Enter" && activeSuggestion) {
      event.preventDefault();
      viewBook(activeSuggestion);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeSuggestions();
    }
  }

  function handleSearch(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    closeSuggestions();
    const trimmed = query.trim();
    setQuery(trimmed);
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
          <div className="search-input-wrapper">
            <input
              type="search"
              name="q"
              value={query}
              onChange={handleInputChange}
              onFocus={() => setShowSuggestions(true)}
              onBlur={closeSuggestions}
              onKeyDown={handleSuggestionKeyDown}
              autoComplete="off"
              placeholder="Search by title or author"
              aria-label="Search by title or author"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showList}
              aria-controls={showList ? "book-suggestions" : undefined}
              aria-activedescendant={
                activeSuggestion
                  ? `book-suggestion-${activeSuggestionIndex}`
                  : undefined
              }
            />

            {showList && (
              <ul
                id="book-suggestions"
                className="book-suggestions"
                role="listbox"
                aria-label="Book suggestions"
                onMouseDown={(event) => event.preventDefault()}
              >
                {suggestions.map((book, index) => (
                  <li
                    key={book.key}
                    id={`book-suggestion-${index}`}
                    className={
                      index === activeSuggestionIndex
                        ? "book-suggestion active"
                        : "book-suggestion"
                    }
                    role="option"
                    aria-selected={index === activeSuggestionIndex}
                    onMouseEnter={() => setActiveSuggestionIndex(index)}
                    onClick={() => viewBook(book)}
                  >
                    <span className="book-suggestion-title">{book.title}</span>
                    <span className="book-suggestion-author">
                      {book.author_name?.join(", ") || "Unknown author"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button type="submit" disabled={visibleLoading}>
            {visibleLoading ? "Searching..." : "Search"}
          </button>
        </form>
      </section>

      {searched && (
        <section className="search-filters" aria-label="Filter search results">
          <details className="genre-filter">
            <summary>Genres</summary>
            <div className="genre-filter-options">
              {genreOptions.map((genre) => (
                <label key={genre}>
                  <input
                    type="checkbox"
                    checked={selectedGenres.includes(genre)}
                    onChange={(event) =>
                      setSelectedGenres((selected) =>
                        event.target.checked
                          ? [...selected, genre]
                          : selected.filter((value) => value !== genre),
                      )
                    }
                  />
                  {genre}
                </label>
              ))}
            </div>
          </details>

          <label className="search-filter">
            Language
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="">Any language</option>
              <option>English</option>
              <option>Spanish</option>
              <option>French</option>
            </select>
          </label>

          <label className="search-filter">
            Publication year
            <select
              value={publicationYearRange}
              onChange={(event) => setPublicationYearRange(event.target.value)}
            >
              <option value="">Any year</option>
              <option value="2020-present">2020–present</option>
              <option value="2010-2019">2010–2019</option>
              <option value="2000-2009">2000–2009</option>
              <option value="1990-1999">1990–1999</option>
              <option value="1980-1989">1980–1989</option>
              <option value="1970-1979">1970–1979</option>
              <option value="1950-1969">1950–1969</option>
              <option value="1900-1949">1900–1949</option>
              <option value="before-1900">Before 1900</option>
            </select>
          </label>
        </section>
      )}

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
                    View details
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
