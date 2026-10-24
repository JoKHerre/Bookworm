import type { Location } from "react-router";

export interface BookDetailsLocationState {
  backLabel?: string;
}

export function bookDetailsPath(bookKey: string) {
  return `/books${bookKey}`;
}

export interface AuthLocationState {
  from?: Location;
}
