import type { BookSearchResult } from "../../shared/books";
import "./BookCard.css";

interface BookCardProps {
  book: BookSearchResult;
  onClick: () => void;
}

function BookCard({ book, onClick }: BookCardProps) {
  const coverUrl = book.cover_i
    ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
    : null;

  return (
    <button
      className="book-card"
      onClick={onClick}
      aria-label={`View details for ${book.title} by ${
        book.author_name?.join(", ") || "Unknown author"
      }`}
    >
      <div className="book-card-cover">
        {coverUrl ? (
          <img src={coverUrl} alt="" />
        ) : (
          <div className="book-card-placeholder" aria-hidden="true" />
        )}
      </div>

      <div className="book-card-info" aria-hidden="true">
        <h2>{book.title}</h2>
        <p className="book-author">
          {book.author_name?.join(", ") || "Unknown author"}
        </p>
        {book.first_publish_year && (
          <p className="book-year">{book.first_publish_year}</p>
        )}
      </div>
    </button>
  );
}

export default BookCard;
