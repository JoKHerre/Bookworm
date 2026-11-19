import { useEffect, useRef, useState } from "react";
import { sortGenres } from "../../shared/interests";
import type { BookGenre } from "../../shared/books";
import { getInterests, saveInterests } from "../api/interests";
import { useAuth } from "../auth/useAuth";

interface InterestsState {
  userId: number;
  genres: BookGenre[] | null; // null when they failed to load
  error: string;
}

// The genres the signed-in user likes. genres is null until they load, and
// stays null when logged out.
export function useInterests() {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState<InterestsState | null>(null);
  const savedRef = useRef<BookGenre[]>([]); // the last list the server confirmed
  const latestSaveRef = useRef(0);

  // state left over from another user is ignored
  const current = state && state.userId === userId ? state : null;
  const genres = current?.genres ?? null;

  useEffect(() => {
    if (userId === undefined) return;

    const controller = new AbortController();
    getInterests(controller.signal)
      .then((loaded) => {
        savedRef.current = loaded;
        setState({ userId, genres: loaded, error: "" });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ userId, genres: null, error: (err as Error).message });
      });
    return () => controller.abort();
  }, [userId]);

  function toggle(genre: BookGenre) {
    if (!genres || userId === undefined) return;
    const next = genres.includes(genre)
      ? genres.filter((value) => value !== genre)
      : sortGenres([...genres, genre]);
    setState({ userId, genres: next, error: "" });

    // only the newest save decides what's shown
    const save = ++latestSaveRef.current;
    saveInterests(next)
      .then((saved) => {
        savedRef.current = saved;
        if (save === latestSaveRef.current) {
          setState({ userId, genres: saved, error: "" });
        }
      })
      .catch((err: unknown) => {
        if (save !== latestSaveRef.current) return;
        setState({
          userId,
          genres: savedRef.current,
          error: (err as Error).message,
        });
      });
  }

  return { genres, error: current?.error ?? "", toggle };
}
