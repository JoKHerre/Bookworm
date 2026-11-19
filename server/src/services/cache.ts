interface Entry<V> {
  value: Promise<V>;
  expiresAt: number;
  settled: boolean;
  waiters: number;
  controller: AbortController;
}

// In-memory cache of promises with a time-to-live and a size cap.
// - Concurrent callers for the same key share one in-flight load.
// - A rejected load is evicted so the next caller retries it.
// - Each caller can stop waiting with its own signal; the shared load is
//   aborted only once every caller waiting on it has given up. A caller
//   without a signal never gives up.
export class PromiseCache<V> {
  readonly #entries = new Map<string, Entry<V>>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;

  constructor(ttlMs: number, maxEntries: number) {
    this.#ttlMs = ttlMs;
    this.#maxEntries = maxEntries;
  }

  get(
    key: string,
    load: (signal: AbortSignal) => Promise<V>,
    signal?: AbortSignal,
  ): Promise<V> {
    signal?.throwIfAborted();
    const entry = this.#lookup(key) ?? this.#start(key, load);
    if (entry.settled) return entry.value;

    entry.waiters++;
    // a caller that can't abort keeps the load alive until it settles
    if (!signal) return entry.value;
    return new Promise<V>((resolve, reject) => {
      const onAbort = () => {
        reject(signal.reason);
        entry.waiters--;
        if (entry.waiters === 0 && !entry.settled) {
          entry.controller.abort(signal.reason);
          this.#evict(key, entry);
        }
      };
      signal.addEventListener("abort", onAbort, { once: true });
      entry.value.then(resolve, reject).finally(() => {
        signal.removeEventListener("abort", onAbort);
      });
    });
  }

  clear() {
    this.#entries.clear();
  }

  #lookup(key: string) {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    this.#entries.delete(key);
    if (entry.expiresAt <= Date.now()) return undefined;
    // re-insert so the Map's insertion order tracks recent use
    this.#entries.set(key, entry);
    return entry;
  }

  #start(key: string, load: (signal: AbortSignal) => Promise<V>) {
    const controller = new AbortController();
    const entry: Entry<V> = {
      value: load(controller.signal),
      expiresAt: Date.now() + this.#ttlMs,
      settled: false,
      waiters: 0,
      controller,
    };
    entry.value.then(
      () => {
        entry.settled = true;
      },
      () => {
        entry.settled = true;
        this.#evict(key, entry);
      },
    );
    this.#entries.set(key, entry);

    for (const oldest of this.#entries.keys()) {
      if (this.#entries.size <= this.#maxEntries) break;
      this.#entries.delete(oldest);
    }
    return entry;
  }

  #evict(key: string, entry: Entry<V>) {
    if (this.#entries.get(key) === entry) this.#entries.delete(key);
  }
}
