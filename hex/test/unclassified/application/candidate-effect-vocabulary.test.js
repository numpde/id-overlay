import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Unclassified: remaining source-scan candidate for the desired effect
// boundary. Behavior-level effect vocabulary is now class-a; this test is still
// pending a classification decision because source scans are useful guardrails
// but can become brittle if they duplicate architecture tests too aggressively.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const APPLICATION_DIR = path.join(REPO_ROOT, "hex/application");

const FORBIDDEN_EFFECT_KINDS = Object.freeze([
  // Transitional/internal vocabulary: persistence is product-declared work, not
  // a notification that some shell watcher should interpret.
  "durable-state-changed",

  // Browser mechanics: the reference-image input adapter may use these, but the
  // application effect vocabulary should not choose browser implementation.
  "read-clipboard-image",
  "start-manual-paste-capture",
  "cancel-manual-paste-capture",

  // Interaction/page mechanics: these are shell adapter responsibilities.
  "forward-map-gesture",
  "dispatch-pointer-event",

  // Image-ref lifetime is not part of the baseline vocabulary until the image
  // reference strategy is decided.
  "release-image-data-ref",
]);

// Candidate: even before runtime wiring exists, production application source
// should not contain the rejected effect names. This catches the undesired shape
// directly instead of relying only on the sampled transitions above.
test("candidate: application source contains no forbidden effect vocabulary", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(APPLICATION_DIR)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const forbiddenKind of FORBIDDEN_EFFECT_KINDS) {
      if (source.includes(forbiddenKind)) {
        violations.push(`${relativeToRepo(filePath)} contains ${forbiddenKind}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

function listJavaScriptFiles(directoryPath) {
  const files = [];
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const filePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(filePath));
      continue;
    }
    if (entry.isFile() && filePath.endsWith(".js")) {
      files.push(filePath);
    }
  }
  return files.sort();
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath);
}
