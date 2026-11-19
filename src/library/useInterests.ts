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
  const savingRef = useRef(false);
  const queuedRef = useRef<BookGenre[] | null>(null); // changed while saving

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

  function save(list: BookGenre[], forUser: number) {
    savingRef.current = true;
    saveInterests(list)
      .then((saved) => {
        savedRef.current = saved;
        const queued = queuedRef.current;
        queuedRef.current = null;
        if (queued) {
          save(queued, forUser);
          return;
        }
        savingRef.current = false;
        setState({ userId: forUser, genres: saved, error: "" });
      })
      .catch((err: unknown) => {
        savingRef.current = false;
        queuedRef.current = null;
        setState({
          userId: forUser,
          genres: savedRef.current,
          error: (err as Error).message,
        });
      });
  }

  function toggle(genre: BookGenre) {
    if (!genres || userId === undefined) return;
    const next = genres.includes(genre)
      ? genres.filter((value) => value !== genre)
      : sortGenres([...genres, genre]);
    setState({ userId, genres: next, error: "" });

    // changes made during a save go out together once it finishes
    if (savingRef.current) queuedRef.current = next;
    else save(next, userId);
  }

  return { genres, error: current?.error ?? "", toggle };
}
