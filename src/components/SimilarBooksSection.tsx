import type { BookSearchResult } from "../../shared/books";
import BookCard from "./BookCard";
import "./SimilarBooksSection.css";

interface SimilarBooksSectionProps {
  books: BookSearchResult[];
  loading: boolean;
  error: string;
  onSelect: (book: BookSearchResult) => void;
  onRetry: () => void;
}

function SimilarBooksSection({
  books,
  loading,
  error,
  onSelect,
  onRetry,
}: SimilarBooksSectionProps) {
  return (
    <section
      className="similar-books"
      aria-label="Similar books"
      aria-busy={loading}
    >
      <h2>Similar books</h2>
      {loading ? (
        <p role="status">Loading similar books...</p>
      ) : error ? (
        <>
          <p role="alert">{error}</p>
          <button
            className="similar-books-retry"
            type="button"
            onClick={onRetry}
          >
            Retry
          </button>
        </>
      ) : books.length === 0 ? (
        <p>No similar books found.</p>
      ) : (
        <div
          className="similar-books-row"
          role="region"
          aria-label="Similar book results"
          tabIndex={0}
        >
          {books.slice(0, 6).map((book) => (
            <BookCard
              key={book.key}
              book={book}
              onClick={() => onSelect(book)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default SimilarBooksSection;
