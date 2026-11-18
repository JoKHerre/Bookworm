import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { BookSearchResult } from "../../shared/books";
import { getSimilarBooks } from "../booksApi";
import { bookDetailsPath } from "../routes";
import SimilarBooksSection from "./SimilarBooksSection";

function SimilarBooks({ bookKey }: { bookKey: string }) {
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    getSimilarBooks(bookKey, signal)
      .then((data) => {
        if (!signal.aborted) setBooks(data.books);
      })
      .catch(() => {
        if (!signal.aborted) setError("Unable to load similar books.");
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [bookKey, attempt]);

  function retry() {
    setBooks([]);
    setError("");
    setLoading(true);
    setAttempt((value) => value + 1);
  }

  function selectBook(book: BookSearchResult) {
    void navigate(bookDetailsPath(book.key), { state: { searchBook: book } });
  }

  return (
    <SimilarBooksSection
      books={books}
      loading={loading}
      error={error}
      onSelect={selectBook}
      onRetry={retry}
    />
  );
}

export default SimilarBooks;
