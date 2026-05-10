import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT_LOADER = path.join(REPO_ROOT, "src/content/content-loader.js");

// Class-b, deliberately not class-a: dynamic import is a Chrome packaging tactic.
// The stable shell boundary is failure posture: if web_accessible_resources or
// bootstrap loading breaks, the loader reports a clear error and leaves the page
// alive instead of throwing an unhandled promise into the host page.
test("content loader reports dynamic import/bootstrap failure without rethrowing", () => {
  const source = fs.readFileSync(CONTENT_LOADER, "utf8");

  assert.match(source, /\bimport\s*\(\s*chrome\.runtime\.getURL\(EXTENSION_CONTENT_MODULE\)\s*\)/);
  assert.match(source, /\.catch\s*\(/);
  assert.match(source, /id-overlay: failed to bootstrap/);
  assert.doesNotMatch(source, /\bthrow\s+error\b/);
});
