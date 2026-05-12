import test from "node:test";
import assert from "node:assert/strict";

import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "./source-files.js";

// Class-a: panel chrome is not product state. Application code may expose a
// product view, commands, effects, history, and durable session data, but panel
// coordinates belong to the browser shell and must stay outside this ring.
test("application source contains no panel chrome vocabulary", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(hexPath("application"))) {
    const source = readSource(filePath);
    for (const pattern of FORBIDDEN_APPLICATION_PANEL_CHROME_PATTERNS) {
      if (pattern.test(source)) {
        violations.push(`${relativeToRepo(filePath)} matches ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

const FORBIDDEN_APPLICATION_PANEL_CHROME_PATTERNS = Object.freeze([
  /\bpanelChrome\b/,
  /\bpanelPosition\b/,
  /\bpanelScreenPx\b/,
  /\bchromePosition\b/,
  /\bid-overlay\/panel\b/,
]);
