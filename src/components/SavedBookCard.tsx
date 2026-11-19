import { useId } from "react";
import type { BookDetails } from "../../shared/books";
import {
  READING_STATUSES,
  type ReadingStatus,
} from "../../shared/readingStatus";
import StarDisplay from "./StarDisplay";
import "./SavedBookCard.css";

const STATUS_LABELS: Record<ReadingStatus, string> = {
  to_be_read: "To Be Read",
  currently_reading: "Currently Reading",
  finished: "Finished",
};

export interface SavedBookCardData {
  id: number;
  bookKey: string;
  readingStatus: ReadingStatus;
  details: BookDetails | null;
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
  const title = book.details?.title ?? "Book details unavailable";
  const coverId = book.details?.covers?.[0];
  const destination = removeFrom === "library" ? "my library" : "collection";
  const busy = isRemoving || isUpdatingReadingStatus;
  return (
    <li className="saved-book-card">
      {coverId ? (
        <img
          className="saved-book-cover"
          src={`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`}
          alt={`Cover of ${title}`}
        />
      ) : (
        <div
          className="saved-book-cover saved-book-cover--placeholder"
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
        <p>{book.details?.authors?.join(", ") || "Author unavailable"}</p>
        {rating !== undefined && <StarDisplay rating={rating} />}
        {!book.details && <p className="saved-book-key">{book.bookKey}</p>}
      </div>
      <div className="saved-book-status">
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
          {READING_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
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
