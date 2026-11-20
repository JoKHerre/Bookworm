import { useId } from "react";
import type { BookDetails } from "../../shared/books";
import {
  READING_STATUS_OPTIONS,
  type ReadingStatus,
} from "../../shared/readingStatus";
import StarDisplay from "./StarDisplay";
import "./SavedBookCard.css";

export interface SavedBookCardData {
  id: number;
  bookKey: string;
  readingStatus: ReadingStatus;
  details: BookDetails | null | undefined;
}

interface Props {
  book: SavedBookCardData;
  rating?: number;
  removeFrom: "library" | "collection";
  onViewBook: () => void;
  onReadingStatusChange: (status: ReadingStatus) => void;
  onRemove: () => void;
  isRemoving?: boolean;
  isUpdatingReadingStatus?: boolean;
  readingStatusError?: string;
  removalError?: string;
  disabled?: boolean;
}

export default function SavedBookCard({
  book,
  rating,
  removeFrom,
  onViewBook,
  onReadingStatusChange,
  onRemove,
  isRemoving = false,
  isUpdatingReadingStatus = false,
  readingStatusError,
  removalError,
  disabled = false,
}: Props) {
  const errorId = useId();
  const title =
    book.details === undefined
      ? "Loading…"
      : (book.details?.title ?? "Book details unavailable");
  const coverId = book.details?.covers?.[0];
  const destination = removeFrom === "library" ? "my library" : "collection";
  const busy = isRemoving || isUpdatingReadingStatus;
  return (
    <li className="saved-book-card" aria-busy={book.details === undefined}>
      {coverId ? (
        <img
          className="saved-book-cover"
          src={`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`}
          alt={`Cover of ${title}`}
        />
      ) : (
        <div
          className={`saved-book-cover saved-book-cover--${book.details === undefined ? "loading" : "placeholder"}`}
          aria-hidden="true"
        />
      )}
      <div className="saved-book-details">
        <h3>
          <button
            className="saved-book-title"
            type="button"
            aria-label={`View details for ${title}`}
            onClick={onViewBook}
          >
            {title}
          </button>
        </h3>
        {book.details !== undefined && (
          <p>{book.details?.authors?.join(", ") || "Author unavailable"}</p>
        )}
        {rating !== undefined && <StarDisplay rating={rating} />}
      </div>
      <div className="saved-book-card-status">
        <select
          aria-label={`Reading status for ${title}`}
          aria-busy={isUpdatingReadingStatus}
          aria-describedby={readingStatusError ? errorId : undefined}
          disabled={disabled || busy}
          value={book.readingStatus}
          onChange={(event) =>
            onReadingStatusChange(event.target.value as ReadingStatus)
          }
        >
          {READING_STATUS_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {isUpdatingReadingStatus && (
          <p className="saved-book-status-message" role="status">
            Saving status…
          </p>
        )}
        {readingStatusError && (
          <p className="saved-book-status-error" id={errorId} role="alert">
            {readingStatusError}
          </p>
        )}
      </div>
      <button
        className="saved-book-remove"
        type="button"
        aria-label={`${isRemoving ? "Removing" : "Remove"} ${title} from ${destination}`}
        aria-busy={isRemoving}
        disabled={disabled || busy}
        onClick={onRemove}
      >
        {isRemoving
          ? "Removing…"
          : removeFrom === "library"
            ? "Remove"
            : "Remove from collection"}
      </button>
      {removalError && (
        <p className="saved-book-status-error" role="alert">
          {removalError}
        </p>
      )}
    </li>
  );
}
