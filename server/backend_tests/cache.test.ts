import assert from "node:assert/strict";
import { test } from "node:test";
import { PromiseCache } from "../src/services/cache.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("concurrent callers share one load", async () => {
  const cache = new PromiseCache<number>(60_000, 10);
  let loads = 0;
  const load = async () => ++loads;

  const [a, b] = await Promise.all([
    cache.get("k", load),
    cache.get("k", load),
  ]);
  assert.equal(a, 1);
  assert.equal(b, 1);
  assert.equal(await cache.get("k", load), 1);
  assert.equal(loads, 1);
});

test("a rejected load is retried by the next caller", async () => {
  const cache = new PromiseCache<string>(60_000, 10);
  await assert.rejects(
    cache.get("k", async () => {
      throw new Error("upstream down");
    }),
    /upstream down/,
  );
  assert.equal(await cache.get("k", async () => "ok"), "ok");
});

test("an expired entry is loaded again", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  const cache = new PromiseCache<number>(1000, 10);
  let loads = 0;
  const load = async () => ++loads;

  await cache.get("k", load);
  t.mock.timers.tick(1001);
  assert.equal(await cache.get("k", load), 2);
});

test("the least recently used entry is dropped past the size cap", async () => {
  const cache = new PromiseCache<string>(60_000, 2);
  const loads: string[] = [];
  const load = (key: string) => async () => {
    loads.push(key);
    return key;
  };

  await cache.get("a", load("a"));
  await cache.get("b", load("b"));
  await cache.get("a", load("a")); // a is now more recent than b
  await cache.get("c", load("c")); // evicts b
  await cache.get("a", load("a"));
  await cache.get("b", load("b"));
  assert.deepEqual(loads, ["a", "b", "c", "b"]);
});

test("the shared load is aborted only after every waiting caller aborts", async () => {
  const cache = new PromiseCache<string>(60_000, 10);
  const pending = deferred<string>();
  let loadSignal: AbortSignal | undefined;
  const load = (signal: AbortSignal) => {
    loadSignal = signal;
    return pending.promise;
  };

  const first = new AbortController();
  const second = new AbortController();
  const a = cache.get("k", load, first.signal);
  const b = cache.get("k", load, second.signal);

  first.abort();
  await assert.rejects(a, { name: "AbortError" });
  assert.equal(loadSignal?.aborted, false);

  second.abort();
  await assert.rejects(b, { name: "AbortError" });
  assert.equal(loadSignal?.aborted, true);

  // the abandoned load is not reused
  assert.equal(await cache.get("k", async () => "fresh"), "fresh");
  pending.resolve("stale");
});

test("a caller without a signal keeps the shared load alive", async () => {
  const cache = new PromiseCache<string>(60_000, 10);
  const pending = deferred<string>();
  let loadSignal: AbortSignal | undefined;
  const load = (signal: AbortSignal) => {
    loadSignal = signal;
    return pending.promise;
  };

  const caller = new AbortController();
  const withSignal = cache.get("k", load, caller.signal);
  const withoutSignal = cache.get("k", load);
  caller.abort();
  await assert.rejects(withSignal, { name: "AbortError" });

  assert.equal(loadSignal?.aborted, false);
  pending.resolve("done");
  assert.equal(await withoutSignal, "done");
});
