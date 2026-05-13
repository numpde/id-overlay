import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT_LOADER = path.join(REPO_ROOT, "src/content/content-loader.js");

// Unclassified candidate: legacy content loading waited for DOM readiness before
// bootstrapping visible UI. The current hex loader is intentionally tiny, and
// the final lifecycle controller shape is unsettled, so keep this as source
// pressure rather than class-b authority.
test("content loader queues bootstrap until DOMContentLoaded when the document is loading", () => {
  const source = readContentLoader();

  assert.match(source, /\bdocument\.readyState\b/);
  assert.match(source, /DOMContentLoaded/);
  assert.match(source, /\baddEventListener\s*\(\s*["']DOMContentLoaded["']/);
});

// Unclassified candidate: loading the content entrypoint twice should share one
// in-flight bootstrap instead of injecting duplicate roots or starting duplicate
// runtimes. The exact sentinel name can change, but the loader needs explicit
// idempotence because browser content scripts can be reinjected.
test("content loader shares one in-flight bootstrap across repeated entrypoint evaluation", () => {
  const source = readContentLoader();

  assert.match(source, /inFlight|bootstrapped|bootstrapPromise|idOverlayBootstrap/i);
  assert.match(source, /window|globalThis/);
});

// Unclassified candidate: a failed dynamic import should be reported without
// poisoning later attempts. Legacy behavior allowed a second loader evaluation
// to succeed after an initial bad extension URL.
test("content loader clears failed bootstrap state so a later evaluation can retry", () => {
  const source = readContentLoader();

  assert.match(source, /\.catch\s*\(/);
  assert.match(source, /inFlight\s*=\s*null|bootstrapPromise\s*=\s*null|delete\s+.*idOverlayBootstrap/i);
  assert.match(source, /failed to bootstrap/);
});

function readContentLoader() {
  return fs.readFileSync(CONTENT_LOADER, "utf8");
}
