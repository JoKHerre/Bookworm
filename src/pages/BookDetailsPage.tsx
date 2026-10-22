import { useEffect, useState } from "react";
import type { BookDetails } from "../../shared/books";
import "./BookDetailsPage.css";

interface BookDetailsPageProps {
  bookKey: string;
  onBack: () => void;
  backLabel?: string;  // optional prop to customize the back button label
}

function BookDetailsPage({
  bookKey,
  onBack,
  backLabel = "Back to Search",
}: BookDetailsPageProps) {
  const [book, setBook] = useState<BookDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false); // used to control save button's availability
  const [saveMessage, setSaveMessage] = useState(""); // used to display message to user after attempting to save a book

  useEffect(() => {
    async function getBookDetails() {
      setLoading(true);
      setError("");
      setBook(null);

      try {
        const response = await fetch(
          `/api/books/details?key=${encodeURIComponent(bookKey)}`,
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

  // function to handle saving a book to the user's personal library
  async function handleSave() {
    // set saving state to true and clear any previous save message
    setSaving(true);
    setSaveMessage("");

    try {
      // send POST request with the bookKey to /api/library
      const response = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookKey }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      // interpret response status + show appropriate message to user through saveMessage
      if (response.status === 201) {
        // success
        setSaveMessage("Book saved to your library.");
      } else if (response.status === 409) {
        // duplicate conflict
        setSaveMessage("This book is already in your library.");
      } else if (response.status === 401) {
        // unauthorized user
        setSaveMessage("Please sign in to save books to your library.");
      } else {
        // other error: generic error msg
        setSaveMessage(
          data.error ?? "Could not save this book. Please try again.",
        );
      }
    } catch {
      // network or other error: generic error msg
      setSaveMessage("Could not save this book. Please try again.");
    } finally {
      // re-enable save button after request is complete, by setting saving to false
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="book-details">
        <button className="back-button" onClick={onBack}>
          {backLabel}
        </button>
        <p>Loading book details...</p>
      </main>
    );
  }

  if (error || !book) {
    return (
      <main className="book-details">
        <button className="back-button" onClick={onBack}>
          {backLabel}
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
        {backLabel}
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

          {/* Button to save book to personal library */}
          <button
            className="save-library-button"
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save to My Library"}
          </button>
          {saveMessage && <p role="status">{saveMessage}</p>}
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
