import type { Location } from "react-router";
import type { BookSearchResult } from "../shared/books";

export interface BookDetailsLocationState {
  backLabel?: string;
  searchBook?: BookSearchResult;
}

export function bookDetailsPath(bookKey: string) {
  return `/books${bookKey}`;
}

export interface AuthLocationState {
  from?: Location;
}
