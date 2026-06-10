#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createIsolatedViewportContext,
  isRetryablePlaywrightTransportError,
  playwrightTransportErrorCode,
  runWithPlaywrightTransportRetry,
} from "./playwright-harness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(playwrightTransportErrorCode(new Error("page.goto: net::ERR_NO_BUFFER_SPACE")), "ERR_NO_BUFFER_SPACE");
assert.equal(playwrightTransportErrorCode(new Error("net::ERR_INSUFFICIENT_RESOURCES")), "ERR_INSUFFICIENT_RESOURCES");
assert.equal(playwrightTransportErrorCode(new Error("Timeout 15000ms exceeded")), null);
assert.equal(isRetryablePlaywrightTransportError(new Error("assertion failed")), false);

const contextCalls = [];
const fakeContext = {
  async addInitScript(script) {
    contextCalls.push(["init", script.toString()]);
  },
};
const fakeBrowser = {
  async newContext(options) {
    contextCalls.push(["context", options]);
    return fakeContext;
  },
};
assert.equal(
  await createIsolatedViewportContext(fakeBrowser, { width: 390, height: 844, isMobile: true, hasTouch: true }),
  fakeContext,
);
assert.deepEqual(contextCalls[0], ["context", { viewport: { width: 390, height: 844 } }]);
assert.match(contextCalls[1][1], /localStorage\.clear/);
assert.match(contextCalls[1][1], /sessionStorage\.clear/);

const recoveredEvents = [];
const recoveredRetries = [];
const recovered = await runWithPlaywrightTransportRetry({
  harness: "game-smoke",
  slug: "maze-chase",
  viewport: "desktop",
  execute: async (attempt) => {
    recoveredEvents.push(`execute-${attempt}`);
    if (attempt === 1) throw new Error("page.goto: net::ERR_NO_BUFFER_SPACE");
    return "passed";
  },
  recycle: async () => {
    recoveredEvents.push("recycle");
  },
  onRetry: async (retry) => {
    recoveredEvents.push("record");
    recoveredRetries.push(retry);
  },
  now: () => "2026-06-10T00:00:00.000Z",
});
assert.equal(recovered, "passed");
assert.deepEqual(recoveredEvents, ["execute-1", "recycle", "record", "execute-2"]);
assert.deepEqual(recoveredRetries, [{
  harness: "game-smoke",
  slug: "maze-chase",
  viewport: "desktop",
  attempt: 2,
  errorCode: "ERR_NO_BUFFER_SPACE",
  at: "2026-06-10T00:00:00.000Z",
}]);
assert.deepEqual(Object.keys(recoveredRetries[0]), [
  "harness",
  "slug",
  "viewport",
  "attempt",
  "errorCode",
  "at",
]);

let repeatedAttempts = 0;
let repeatedRecycles = 0;
await assert.rejects(
  runWithPlaywrightTransportRetry({
    harness: "render-capture",
    slug: "shadow-switch",
    viewport: "mobile",
    execute: async () => {
      repeatedAttempts += 1;
      throw new Error("net::ERR_INSUFFICIENT_RESOURCES");
    },
    recycle: async () => {
      repeatedRecycles += 1;
    },
  }),
  /ERR_INSUFFICIENT_RESOURCES/,
);
assert.equal(repeatedAttempts, 2);
assert.equal(repeatedRecycles, 1);

let nonRetryableAttempts = 0;
let nonRetryableRecycles = 0;
await assert.rejects(
  runWithPlaywrightTransportRetry({
    harness: "game-smoke",
    slug: "maze-chase",
    viewport: "desktop",
    execute: async () => {
      nonRetryableAttempts += 1;
      throw new Error("Timeout 15000ms exceeded");
    },
    recycle: async () => {
      nonRetryableRecycles += 1;
    },
  }),
  /Timeout 15000ms exceeded/,
);
assert.equal(nonRetryableAttempts, 1);
assert.equal(nonRetryableRecycles, 0);

const smokeSource = await readFile(path.join(repoRoot, "scripts", "smoke-games.mjs"), "utf8");
const captureSource = await readFile(path.join(repoRoot, "scripts", "capture-games.mjs"), "utf8");
for (const [label, source] of [["smoke", smokeSource], ["capture", captureSource]]) {
  for (const snippet of [
    'from "./playwright-harness.mjs"',
    "createIsolatedViewportContext",
    "runWithPlaywrightTransportRetry",
    "transportRetryCount:",
    "transportRetries,",
  ]) {
    assert.ok(source.includes(snippet), `${label} harness missing ${snippet}`);
  }
}
assert.ok(smokeSource.includes("context.newPage()"), "smoke harness must create game pages inside reusable contexts");
assert.ok(captureSource.includes("context.newPage()"), "capture harness must create game pages inside reusable contexts");
assert.ok(!captureSource.includes("browserInstance.newPage({ viewport })"), "capture surfaces must not create a browser context per page");

console.log("Playwright harness contract passed: isolated viewport contexts, bounded transport retry, and retry evidence are wired.");
