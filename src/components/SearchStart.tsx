import { useEffect, useState } from "react";
import type { BookDetails } from "../../shared/books";
import type { SavedBook } from "../../shared/library";
import { getBookDetails } from "../api/books";
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
  onOpenBook: (bookKey: string) => void;
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

  const shelfBooks = shelf.flatMap(({ bookKey }) => {
    const book = details[bookKey];
    return book ? [{ bookKey, book }] : [];
  });
  const searches =
    recentSearches.length > 0 ? recentSearches : EXAMPLE_SEARCHES;

  return (
    <div className="search-start">
      {shelfBooks.length > 0 && (
        <section aria-labelledby="search-start-reading">
          <h2 id="search-start-reading">Currently reading</h2>
          <ul className="search-start-shelf">
            {shelfBooks.map(({ bookKey, book }) => {
              const coverId = book.covers?.[0];
              return (
                <li key={bookKey}>
                  <button type="button" onClick={() => onOpenBook(bookKey)}>
                    {coverId ? (
                      <img
                        src={`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`}
                        alt=""
                      />
                    ) : (
                      <span className="search-start-cover" aria-hidden="true" />
                    )}
                    <span className="search-start-title">{book.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
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
    </div>
  );
}

export default SearchStart;
