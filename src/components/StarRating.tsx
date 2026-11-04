import { useId } from "react";
import { MAX_RATING } from "../../shared/ratings";
import "./StarRating.css";

interface StarRatingProps {
  value: number | null; // the current rating, or null if unrated
  onChange: (rating: number) => void;
  disabled?: boolean;
}

const STARS = Array.from({ length: MAX_RATING }, (_, i) => i + 1);

// a 1-5 star control built from radio inputs, so it works with keyboard and screen readers
function StarRating({ value, onChange, disabled = false }: StarRatingProps) {
  const name = useId();

  return (
    <fieldset className="star-rating" disabled={disabled}>
      <legend>Your rating</legend>
      <div className="star-rating-stars">
        {STARS.map((star) => (
          <label
            key={star}
            className={
              value !== null && star <= value
                ? "star-rating-star star-rating-star--filled"
                : "star-rating-star"
            }
          >
            <input
              type="radio"
              name={name}
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
            />
            <span aria-hidden="true">★</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default StarRating;
