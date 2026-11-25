import { useSyncExternalStore } from "react";

const KEY = "homeBranch";
const listeners = new Set<() => void>();

const read = () => localStorage.getItem(KEY) ?? "";
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useHomeBranch() {
  const branch = useSyncExternalStore(subscribe, read);

  function setBranch(next: string) {
    localStorage.setItem(KEY, next);
    listeners.forEach((l) => l());
  }

  return [branch, setBranch] as const;
}
