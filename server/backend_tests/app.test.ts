import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.ts";
import { startTestServer } from "./test-utils.ts";

let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  ({ baseUrl, close: closeServer } = await startTestServer(createApp()));
});

after(() => closeServer());

function postJson(body: string) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

test("REF-01-T-2 malformed JSON is a bad request", async () => {
  const response = await postJson("{");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Bad request" });
});

test("REF-01-T-2 an oversized body says so", async () => {
  const response = await postJson(
    JSON.stringify({ email: "x".repeat(200_000) }),
  );
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "Payload Too Large" });
});
