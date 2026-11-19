import { useEffect, useState } from "react";
import {
  BOOK_GENRES,
  type BookDetails,
  type BookSearchResult,
} from "../../shared/books";
import type { SavedBook } from "../../shared/library";
import { getBookDetails } from "../api/books";
import { getRecommendations } from "../api/recommendations";
import { useAuth } from "../auth/useAuth";
import { useInterests } from "../library/useInterests";
import "./SearchStart.css";

// a few searches that show what Bookworm can find, for a first visit
const EXAMPLE_SEARCHES = [
  "Ursula K. Le Guin",
  "Pride and Prejudice",
  "Project Hail Mary",
];
const SHELF_LIMIT = 6;

interface SearchStartProps {
  reading: SavedBook[]; // the signed-in user's currently reading books
  recentSearches: string[];
  onSearch: (query: string) => void;
  // searchBook, when given, lets the details page show the book right away
  onOpenBook: (bookKey: string, searchBook?: BookSearchResult) => void;
}

interface ShelfBook {
  key: string;
  title: string;
  author?: string | undefined;
  coverId?: number | undefined;
  onOpen: () => void;
}

function Shelf({ books }: { books: ShelfBook[] }) {
  return (
    <ul className="search-start-shelf">
      {books.map((book) => (
        <li key={book.key}>
          <button type="button" onClick={book.onOpen}>
            {book.coverId ? (
              <img
                src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`}
                alt=""
              />
            ) : (
              <span className="search-start-cover" aria-hidden="true" />
            )}
            <span className="search-start-title">{book.title}</span>
            {book.author && (
              <span className="search-start-author">{book.author}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

interface Recommendations {
  key: string; // the user and saved genres they were loaded for
  books: BookSearchResult[] | null;
  error: string;
}

// What the search page shows before anything is searched.
function SearchStart({
  reading,
  recentSearches,
  onSearch,
  onOpenBook,
}: SearchStartProps) {
  const shelf = reading.slice(0, SHELF_LIMIT);
  const shelfKeys = shelf.map((book) => book.bookKey).join("\n");
  const [details, setDetails] = useState<Record<string, BookDetails>>({});
  const { user } = useAuth();
  const interests = useInterests();
  const [recommendations, setRecommendations] =
    useState<Recommendations | null>(null);
  const recommendationsKey = interests.savedGenres?.length
    ? `${user?.id}:${interests.savedGenres.join(",")}`
    : "";

  useEffect(() => {
    if (!shelfKeys) return;
    const controller = new AbortController();
    for (const bookKey of shelfKeys.split("\n")) {
      getBookDetails(bookKey, controller.signal)
        .then((book) =>
          setDetails((current) => ({ ...current, [bookKey]: book })),
        )
        .catch(() => {
          // a book without details is skipped
        });
    }
    return () => controller.abort();
  }, [shelfKeys]);

  useEffect(() => {
    if (!recommendationsKey) return;
    const controller = new AbortController();
    getRecommendations(controller.signal)
      .then((books) =>
        setRecommendations({ key: recommendationsKey, books, error: "" }),
      )
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setRecommendations({
          key: recommendationsKey,
          books: null,
          error: (err as Error).message,
        });
      });
    return () => controller.abort();
  }, [recommendationsKey]);

  const shelfBooks = shelf.flatMap(({ bookKey }): ShelfBook[] => {
    const book = details[bookKey];
    return book
      ? [
          {
            key: bookKey,
            title: book.title,
            coverId: book.covers?.[0],
            onOpen: () => onOpenBook(bookKey),
          },
        ]
      : [];
  });
  // null while loading
  const recommended =
    recommendations?.key === recommendationsKey ? recommendations : null;
  const searches =
    recentSearches.length > 0 ? recentSearches : EXAMPLE_SEARCHES;

  return (
    <div className="search-start">
      {shelfBooks.length > 0 && (
        <section aria-labelledby="search-start-reading">
          <h2 id="search-start-reading">Currently reading</h2>
          <Shelf books={shelfBooks} />
        </section>
      )}

      <section aria-labelledby="search-start-searches">
        <h2 id="search-start-searches">
          {recentSearches.length > 0 ? "Recent searches" : "Try searching for"}
        </h2>
        <ul className="search-start-chips">
          {searches.map((query) => (
            <li key={query}>
              <button type="button" onClick={() => onSearch(query)}>
                {query}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {(interests.genres || interests.error) && (
        <section aria-labelledby="search-start-genres">
          <h2 id="search-start-genres">Genres you like</h2>
          {interests.genres && (
            <ul className="search-start-chips">
              {BOOK_GENRES.map((genre) => (
                <li key={genre}>
                  <button
                    type="button"
                    aria-pressed={interests.genres?.includes(genre)}
                    onClick={() => interests.toggle(genre)}
                  >
                    {genre}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {interests.error && (
            <p className="search-start-error" role="alert">
              {interests.error}
            </p>
          )}
        </section>
      )}

      {recommendationsKey && (
        <section aria-labelledby="search-start-recommended">
          <h2 id="search-start-recommended">Recommended for you</h2>
          {!recommended && (
            <p className="search-start-message" role="status">
              Loading recommendations...
            </p>
          )}
          {recommended?.error && (
            <p className="search-start-error" role="alert">
              {recommended.error}
            </p>
          )}
          {recommended?.books?.length === 0 && (
            <p className="search-start-message">
              No recommendations for these genres yet.
            </p>
          )}
          {recommended?.books && recommended.books.length > 0 && (
            <Shelf
              books={recommended.books.map((book) => ({
                key: book.key,
                title: book.title,
                author: book.author_name?.[0],
                coverId: book.cover_i,
                onOpen: () => onOpenBook(book.key, book),
              }))}
            />
          )}
        </section>
      )}
    </div>
  );
}

export default SearchStart;
