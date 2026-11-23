import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { SavedBook } from "../../shared/library";
import type { ReadingStatus } from "../../shared/readingStatus";
import { ApiRequestError, errorMessage } from "../api/client";
import {
  getLibrary,
  saveBook as requestSave,
  updateReadingStatus as requestReadingStatus,
} from "../api/library";
import { useAuth } from "../auth/useAuth";
import type { AuthLocationState, PendingActionState } from "../routes";

// Send a logged-out user to log in, carrying the action they started so the
// page they come back to can finish it.
export function useLoginToFinish() {
  const location = useLocation();
  const navigate = useNavigate();

  return useCallback(
    (pending: PendingActionState = {}) => {
      const from = {
        ...location,
        state: { ...(location.state as object | null), ...pending },
      };
      const state: AuthLocationState = { from };
      void navigate("/login", { state, replace: true });
    },
    [location, navigate],
  );
}

// Run `finish` once with the pending action named by `key`, after login, then
// drop it from the history entry so a refresh or Back doesn't repeat it.
export function usePendingAction<K extends keyof PendingActionState>(
  key: K,
  finish: (value: NonNullable<PendingActionState[K]>) => void,
) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as PendingActionState | null;
  const pending = state?.[key];
  const finishedRef = useRef(false);

  useEffect(() => {
    if (pending === undefined) {
      finishedRef.current = false;
      return;
    }
    if (!user || finishedRef.current) return;
    finishedRef.current = true;
    const rest: Record<string, unknown> = { ...state };
    delete rest[key];
    void navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: rest,
    });
    finish(pending as NonNullable<PendingActionState[K]>);
  }, [user, pending, state, key, location, navigate, finish]);
}

// The signed-in user's saved books by book key, with save and status updates.
// Logged out, saving sends the user to log in and finishes the save after.
export function useSavedBooks() {
  const { user } = useAuth();
  const loginToFinish = useLoginToFinish();
  const [saved, setSaved] = useState<Map<string, SavedBook>>(() => new Map());
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({}); // keyed by book key

  const userId = user?.id;
  // merge, so a save that finished while the library loaded isn't lost
  const loadLibrary = useCallback(
    (signal?: AbortSignal) =>
      getLibrary(signal).then(({ books }) => {
        if (signal?.aborted) return;
        setSaved((current) => {
          const next = new Map(current);
          for (const book of books) next.set(book.bookKey, book);
          return next;
        });
      }),
    [],
  );

  useEffect(() => {
    if (userId === undefined) return;
    const controller = new AbortController();
    // without the library, books just show as not saved yet
    void loadLibrary(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [userId, loadLibrary]);

  function setBusy(bookKey: string, busy: boolean) {
    setBusyKeys((current) => {
      const next = new Set(current);
      if (busy) next.add(bookKey);
      else next.delete(bookKey);
      return next;
    });
  }

  function setError(bookKey: string, message: string) {
    setErrors((current) => {
      const next = { ...current };
      if (message) next[bookKey] = message;
      else delete next[bookKey];
      return next;
    });
  }

  const save = useCallback(
    async (bookKey: string) => {
      if (!user) {
        loginToFinish({ pendingSave: bookKey });
        return;
      }
      setBusy(bookKey, true);
      setError(bookKey, "");
      try {
        const book = await requestSave(bookKey);
        setSaved((current) =>
          new Map(current).set(bookKey, {
            id: book.id,
            bookKey,
            readingStatus: "to_be_read",
            createdAt: book.createdAt,
          }),
        );
      } catch (err) {
        // already saved elsewhere: pick up that copy instead of an error
        if (err instanceof ApiRequestError && err.status === 409) {
          await loadLibrary().catch(() => {});
        } else {
          setError(
            bookKey,
            errorMessage(err, {
              fallback: "Could not save this book.",
              byStatus: {
                401: "Your session has expired. Please log in again.",
              },
              useServerMessage: true,
            }),
          );
        }
      } finally {
        setBusy(bookKey, false);
      }
    },
    [user, loginToFinish, loadLibrary],
  );

  usePendingAction("pendingSave", save);

  async function setReadingStatus(
    bookKey: string,
    readingStatus: ReadingStatus,
  ) {
    const book = saved.get(bookKey);
    if (!book) return;
    setBusy(bookKey, true);
    setError(bookKey, "");
    setSaved((current) =>
      new Map(current).set(bookKey, { ...book, readingStatus }),
    );
    try {
      await requestReadingStatus(book.id, readingStatus);
    } catch (err) {
      setSaved((current) => new Map(current).set(bookKey, book));
      setError(
        bookKey,
        errorMessage(err, {
          fallback: "Could not update this book's reading status.",
        }),
      );
    } finally {
      setBusy(bookKey, false);
    }
  }

  function rememberSavedBook(book: SavedBook) {
    setSaved((current) => new Map(current).set(book.bookKey, book));
    setError(book.bookKey, "");
  }

  return { saved, busyKeys, errors, save, setReadingStatus, rememberSavedBook };
}
