import { useState } from "react";
import type { ComponentProps } from "react";
import type { BookSearchResponse, BookSearchResult } from "../../shared/books";
import BookCard from "../components/BookCard";
import BookDetailsPage from "./BookDetailsPage";
import "./SearchPage.css";

function SearchPage() {
  const [query, setQuery] = useState("");
  const [books, setBooks] = useState<BookSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedBookKey, setSelectedBookKey] = useState<string | null>(null);

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

  const booksWithCovers = books.filter((book) => book.cover_i);

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

      {error && <p className="search-message">{error}</p>}

      {loading && <p className="search-message">Searching for books...</p>}

      {!loading && !error && searched && booksWithCovers.length === 0 && (
        <p className="search-message">No results.</p>
      )}

      <section className="book-grid">
        {booksWithCovers.map((book) => (
          <BookCard
            key={book.key}
            book={book}
            onClick={() => {
              setSelectedBookKey(book.key);
            }}
          />
        ))}
      </section>
    </main>
  );
}

export default SearchPage;
