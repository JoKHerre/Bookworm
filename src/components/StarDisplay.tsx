import { MAX_RATING } from "../../shared/ratings";
import "./StarRating.css";

// read-only display of a 1-5 rating, e.g. on a library book card
function StarDisplay({ rating }: { rating: number }) {
  return (
    <p
      className="star-display"
      role="img"
      aria-label={`Rated ${rating} out of ${MAX_RATING} stars`}
    >
      {"★".repeat(rating)}
      <span className="star-display-empty">
        {"★".repeat(MAX_RATING - rating)}
      </span>
    </p>
  );
}

export default StarDisplay;
