import { useState, type FormEvent } from "react";
import BookCard, { type Book } from "../components/BookCard";
import "./SearchPage.css";

interface SearchResponse {
  books: Book[];
  total: number;
}

interface SearchPageProps {
  onBookSelect: (book: Book) => void;
  onBack: () => void;
}

function SearchPage({ onBookSelect, onBack }: SearchPageProps) {
  const [query, setQuery] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
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

    try {
      const response = await fetch(
        `/api/books/search?q=${encodeURIComponent(query.trim())}`
      );

      if (!response.ok) {
        throw new Error("Search failed.");
      }

      const data: SearchResponse = await response.json();
      setBooks(data.books ?? []);
    } catch (err) {
      console.error("Book search error:", err);
      setError("Unable to search for books. Please try again.");
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }

  const booksWithCovers = books.filter((book) => book.cover_i);

  return (
    <main className="search-page">
      {/* <button className="back-button" onClick={onBack}>
        Back
      </button> */}

      <section className="search-intro">

        <form className="book-search-form" onSubmit={handleSearch}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title or author..."
            aria-label="Search by title or author"
          />

          <button type="submit" disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
        </form>
      </section>

      {error && <p className="search-message">{error}</p>}

      {loading && <p className="search-message">Searching for books...</p>}

      {!loading && !error && searched && booksWithCovers.length === 0 && (
        <p className="search-message">
          No results.
        </p>
      )}

      <section className="book-grid">
        {booksWithCovers.map((book) => (
          <BookCard
            key={book.key}
            book={book}
            onClick={() => onBookSelect(book)}
          />
        ))}
      </section>
    </main>
  );
}

export default SearchPage;