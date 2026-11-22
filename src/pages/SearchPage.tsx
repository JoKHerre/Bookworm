import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  BOOK_GENRES,
  BOOK_LANGUAGES,
  MAX_SEARCH_PAGE,
  PUBLICATION_YEAR_RANGES,
  bookSuggestionsQuery,
  type BookSearchQuery,
  type BookSearchResult,
} from "../../shared/books";
import { getBookSuggestions, searchBooks } from "../api/books";
import BookCard from "../components/BookCard";
import SearchStart from "../components/SearchStart";
import { useSavedBooks } from "../library/useSavedBooks";
import { bookDetailsPath, type BookDetailsLocationState } from "../routes";
import "./SearchPage.css";

// long enough to skip a request per keystroke, short enough to keep up with typing
const SUGGESTION_DELAY_MS = 250;

const RECENT_SEARCHES_KEY = "bookworm:recent-searches";
const RECENT_SEARCHES_LIMIT = 6;

// Recent searches are a per-browser convenience; without storage there are none.
function readRecentSearches(): string[] {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]",
    );
    return Array.isArray(stored)
      ? stored
          .filter((value) => typeof value === "string")
          .slice(0, RECENT_SEARCHES_LIMIT)
      : [];
  } catch {
    return [];
  }
}

type ViewMode = "grid" | "list";
type Filters = Omit<BookSearchQuery, "q" | "page">;

// Filters live in the URL beside q, so a refresh or Back keeps them.
// Values the filters don't offer are ignored.
function filtersFromParams(params: URLSearchParams): Filters {
  const genres = params.getAll("genre");
  return {
    genre: BOOK_GENRES.filter((genre) => genres.includes(genre)),
    language:
      BOOK_LANGUAGES.find((value) => value === params.get("language")) ?? "",
    year:
      PUBLICATION_YEAR_RANGES.find((value) => value === params.get("year")) ??
      "",
  };
}

// How many pages of results the URL asks for. Show more counts up, so a
// refresh or Back brings the same results.
function pagesFromParams(params: URLSearchParams) {
  const pages = Number(params.get("page"));
  return Number.isInteger(pages) && pages > 1
    ? Math.min(pages, MAX_SEARCH_PAGE)
    : 1;
}

// a book can shift onto the next page between requests, so drop repeats
function withoutRepeats(books: BookSearchResult[]) {
  const seen = new Set<string>();
  return books.filter((book) => {
    if (seen.has(book.key)) return false;
    seen.add(book.key);
    return true;
  });
}

function yearLabel(range: (typeof PUBLICATION_YEAR_RANGES)[number]) {
  return range === "before-1900" ? "Before 1900" : range;
}

function paramsFor(q: string, { genre, language, year }: Filters) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  for (const value of genre) params.append("genre", value);
  if (language) params.set("language", language);
  if (year) params.set("year", year);
  return params;
}

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const submittedQuery = searchParams.get("q") ?? "";
  const navigate = useNavigate();
  const { saved, busyKeys, errors, save } = useSavedBooks();
  const [recentSearches, setRecentSearches] = useState(readRecentSearches);

  const [books, setBooks] = useState<BookSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1); // the last page of results loaded
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const moreRequest = useRef<AbortController | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const urlPages = pagesFromParams(searchParams);
  // memoized on the query string so the search effect sees stable arrays;
  // the page count is left out so Show more doesn't search again
  const paramsWithoutPage = new URLSearchParams(searchParams);
  paramsWithoutPage.delete("page");
  const searchString = paramsWithoutPage.toString();
  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(searchString)),
    [searchString],
  );
  const {
    genre: selectedGenres,
    language,
    year: publicationYearRange,
  } = filters;
  const hasActiveFilters =
    selectedGenres.length > 0 || language !== "" || publicationYearRange !== "";
  const genreFilterRef = useRef<HTMLDetailsElement>(null);
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
    function handleClickOutside(event: PointerEvent) {
      const dropdown = genreFilterRef.current;
      if (
        dropdown?.open &&
        event.target instanceof Node &&
        !dropdown.contains(event.target)
      ) {
        dropdown.open = false;
      }
    }

    document.addEventListener("pointerdown", handleClickOutside);
    return () =>
      document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  const pagesToLoad = useEffectEvent(() => urlPages);

  useEffect(() => {
    if (!submittedQuery) return;

    const controller = new AbortController();
    const { signal } = controller;

    async function search() {
      moreRequest.current?.abort();
      setLoading(true);
      setError("");
      setPage(1);
      setLoadingMore(false);
      setMoreError("");

      try {
        const pages = pagesToLoad();
        const results = await Promise.all(
          Array.from({ length: pages }, (_, i) =>
            searchBooks(
              submittedQuery,
              signal,
              i === 0 ? filters : { ...filters, page: i + 1 },
            ),
          ),
        );
        if (!signal.aborted) {
          setBooks(withoutRepeats(results.flatMap((data) => data.books)));
          setTotal(results.at(-1)?.total ?? 0);
          setPage(pages);
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
  }, [submittedQuery, searchAttempt, filters]);

  useEffect(() => () => moreRequest.current?.abort(), []);

  async function loadMore() {
    const controller = new AbortController();
    moreRequest.current = controller;
    const next = page + 1;
    setLoadingMore(true);
    setMoreError("");

    try {
      const data = await searchBooks(submittedQuery, controller.signal, {
        ...filters,
        page: next,
      });
      if (controller.signal.aborted) return;
      setBooks((current) => withoutRepeats([...current, ...data.books]));
      setTotal(data.total);
      setPage(next);
      const params = new URLSearchParams(searchParams);
      params.set("page", String(next));
      setSearchParams(params, { replace: true });
    } catch (err) {
      if (controller.signal.aborted) return;
      setMoreError(
        err instanceof Error ? err.message : "Unable to load more books",
      );
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

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
    }, SUGGESTION_DELAY_MS);

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

  function rememberSearch(q: string) {
    if (!q) return;
    const next = [
      q,
      ...recentSearches.filter(
        (recent) => recent.toLowerCase() !== q.toLowerCase(),
      ),
    ].slice(0, RECENT_SEARCHES_LIMIT);
    setRecentSearches(next);
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    } catch {
      // not remembered this time
    }
  }

  function runSearch(q: string) {
    rememberSearch(q);
    if (q === submittedQuery) {
      setSearchAttempt((attempt) => attempt + 1);
    } else {
      setSearchParams(paramsFor(q, filters));
    }
  }

  function handleSearch(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    closeSuggestions();
    const trimmed = query.trim();
    setQuery(trimmed);
    runSearch(trimmed);
  }

  function viewBook(book: BookSearchResult) {
    const state: BookDetailsLocationState = {
      backLabel: "Back to Search",
      searchBook: book,
    };
    void navigate(bookDetailsPath(book.key), { state });
  }

  function renderSaveAction(book: BookSearchResult) {
    const busy = busyKeys.has(book.key);
    return (
      <div className="result-save">
        {saved.has(book.key) ? (
          <span className="result-save-done">✓ In your library</span>
        ) : (
          <button
            type="button"
            aria-label={`Save ${book.title} to my library`}
            disabled={busy}
            onClick={() => void save(book.key)}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        )}
        {errors[book.key] && <p role="alert">{errors[book.key]}</p>}
      </div>
    );
  }

  function updateFilters(changes: Partial<Filters>) {
    setSearchParams(paramsFor(submittedQuery, { ...filters, ...changes }), {
      replace: true,
    });
  }

  function resetFilters() {
    updateFilters({ genre: [], language: "", year: "" });
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
                    {" - "}
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
          <details className="genre-filter" ref={genreFilterRef}>
            <summary>Genres</summary>
            <div className="genre-filter-options">
              {BOOK_GENRES.map((genre) => (
                <label key={genre}>
                  <input
                    type="checkbox"
                    checked={selectedGenres.includes(genre)}
                    onChange={(event) =>
                      updateFilters({
                        genre: event.target.checked
                          ? [...selectedGenres, genre]
                          : selectedGenres.filter((value) => value !== genre),
                      })
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
              onChange={(event) =>
                updateFilters({
                  language: event.target.value as Filters["language"],
                })
              }
            >
              <option value="">Any language</option>
              {BOOK_LANGUAGES.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="search-filter">
            Publication year
            <select
              value={publicationYearRange}
              onChange={(event) =>
                updateFilters({ year: event.target.value as Filters["year"] })
              }
            >
              <option value="">Any year</option>
              {PUBLICATION_YEAR_RANGES.map((range) => (
                <option key={range} value={range}>
                  {yearLabel(range)}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {searched && hasActiveFilters && (
        <ul className="search-filter-chips" aria-label="Active filters">
          {selectedGenres.map((genre) => (
            <li key={genre}>
              <button
                type="button"
                aria-label={`Remove ${genre} filter`}
                onClick={() =>
                  updateFilters({
                    genre: selectedGenres.filter((value) => value !== genre),
                  })
                }
              >
                {genre} <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
          {language && (
            <li>
              <button
                type="button"
                aria-label={`Remove ${language} filter`}
                onClick={() => updateFilters({ language: "" })}
              >
                {language} <span aria-hidden="true">×</span>
              </button>
            </li>
          )}
          {publicationYearRange && (
            <li>
              <button
                type="button"
                aria-label={`Remove ${yearLabel(publicationYearRange)} filter`}
                onClick={() => updateFilters({ year: "" })}
              >
                {yearLabel(publicationYearRange)}{" "}
                <span aria-hidden="true">×</span>
              </button>
            </li>
          )}
          <li>
            <button
              type="button"
              className="search-filter-reset"
              onClick={resetFilters}
            >
              Clear all
            </button>
          </li>
        </ul>
      )}

      {!searched && (
        <SearchStart
          reading={[...saved.values()].filter(
            (book) => book.readingStatus === "currently_reading",
          )}
          recentSearches={recentSearches}
          onSearch={runSearch}
          onOpenBook={(bookKey, searchBook) => {
            const state: BookDetailsLocationState = {
              backLabel: "Back to Search",
              searchBook,
            };
            void navigate(bookDetailsPath(bookKey), { state });
          }}
        />
      )}

      {visibleError && (
        <p className="search-message search-message--error" role="alert">
          {visibleError}
        </p>
      )}

      {visibleLoading && (
        <p className="search-message" role="status">
          Searching for books...
        </p>
      )}

      {!visibleLoading &&
        !visibleError &&
        searched &&
        visibleBooks.length === 0 && (
          <div className="search-message" role="status">
            <p>
              No books found for “{submittedQuery}”
              {hasActiveFilters ? " with these filters." : "."}
            </p>
            {hasActiveFilters ? (
              <button type="button" onClick={resetFilters}>
                Search without filters
              </button>
            ) : (
              <p>Check the spelling, or try fewer words.</p>
            )}
          </div>
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
                <div className="book-grid-item" key={book.key}>
                  <BookCard book={book} onClick={() => viewBook(book)} />
                  {renderSaveAction(book)}
                </div>
              ))}
            </section>
          ) : (
            <section className="book-list" aria-label="Book search results">
              {visibleBooks.map((book) => (
                <div key={book.key} className="book-list-item">
                  <button
                    type="button"
                    className="book-list-open"
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
                  </button>
                  {renderSaveAction(book)}
                </div>
              ))}
            </section>
          )}

          {visibleBooks.length < total && page < MAX_SEARCH_PAGE && (
            <div className="search-more">
              {moreError && (
                <p className="search-more-error" role="alert">
                  {moreError}
                </p>
              )}
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading..." : "Show more"}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default SearchPage;
