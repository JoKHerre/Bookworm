export interface Book {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  edition_count?: number;
}

interface BookCardProps {
  book: Book;
  onClick: () => void;
}

function BookCard({ book, onClick }: BookCardProps) {
  if (!book.cover_i) return null;

  const coverUrl =
    `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`;

  return (
    <button
      className="book-card"
      onClick={onClick}
      aria-label={`View details for ${book.title}`}
    >
      <div className="book-card-cover">
        <img src={coverUrl} alt={`Cover of ${book.title}`} />
      </div>
      
      <div className="book-card-info">
        <h2>{book.title}</h2>
        <p className="book-author">
          {book.author_name?.join(", ") || "Unknown author"}
        </p>
        {book.first_publish_year && <p>{book.first_publish_year}</p>}
      </div>
    </button>
  );
}

export default BookCard;