import { useEffect, useState } from "react";
import "./BookDetailsPage.css";

interface BookDetails {
  key: string;
  title: string;
  description?: string | { value: string };
  authors?: string[];
  first_publish_date?: string;
  covers?: number[];
  subjects?: string[];
}

interface BookDetailsPageProps {
  bookKey: string;
  onBack: () => void;
}

function BookDetailsPage({ bookKey, onBack }: BookDetailsPageProps) {
  const [book, setBook] = useState<BookDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function getBookDetails() {
      setLoading(true);
      setError("");
      setBook(null);

      try {
        const response = await fetch(
          `/api/books/details?key=${encodeURIComponent(bookKey)}`
        );

        if (!response.ok) {
          throw new Error("Could not find this book.");
        }

        const data: BookDetails = await response.json();
        setBook(data);
      } catch (error) {
        console.error("Error loading book:", error);
        setError("Could not load this book. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    getBookDetails();
  }, [bookKey]);

  if (loading) {
    return (
      <main className="book-details">
        <button className="back-button" onClick={onBack}>
          Back to Search
        </button>
        <p>Loading book details...</p>
      </main>
    );
  }

  if (error || !book) {
    return (
      <main className="book-details">
        <button className="back-button" onClick={onBack}>
          Back to Search
        </button>
        <p>{error || "Book not found."}</p>
      </main>
    );
  }

  const summary =
    typeof book.description === "string"
      ? book.description
      : book.description?.value;

  const coverUrl = book.covers?.[0]
    ? `https://covers.openlibrary.org/b/id/${book.covers[0]}-L.jpg`
    : null;

  return (
    <main className="book-details">
      <button className="back-button" onClick={onBack}>
        Back to Search
      </button>

      {/* Book cover and basic information */}
      <section className="book-header">
        {coverUrl && (
          <img
            className="book-cover"
            src={coverUrl}
            alt={`Cover of ${book.title}`}
          />
        )}

        <div className="book-info">
          <h1 className="book-details-title">{book.title}</h1>

          <p className="book-details-author">
            {book.authors?.join(", ") || "Unknown author"}
          </p>

        </div>
      </section>

      {/* Book summary */}
      <section className="book-summary">
        <h2>Summary</h2>
        <p>{summary || "No summary available."}</p>
      </section>

      {/* Book genres and subjects */}
      <section className="book-genres">
        <h2>Genres</h2>

        {book.subjects && book.subjects.length > 0 ? (
          <div className="genre-list">
            {book.subjects.slice(0, 10).map((subject) => (
              <span className="genre-tag" key={subject}>
                {subject}
              </span>
            ))}
          </div>
        ) : (
          <p>No genres or subjects available.</p>
        )}
      </section>
    </main>
  );
}

export default BookDetailsPage;