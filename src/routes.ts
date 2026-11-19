import type { Location } from "react-router";
import type { BookSearchResult } from "../shared/books";

// An action a logged-out user started. It rides along in the location they
// return to after logging in, and that page finishes it.
export interface PendingActionState {
  pendingSave?: string; // book key
  pendingRating?: number;
}

export interface BookDetailsLocationState extends PendingActionState {
  backLabel?: string;
  searchBook?: BookSearchResult;
}

export function bookDetailsPath(bookKey: string) {
  return `/books${bookKey}`;
}

export function collectionDetailsPath(collectionId: number) {
  return `/personal-library/collections/${collectionId}`;
}

export interface AuthLocationState {
  from?: Location;
}
