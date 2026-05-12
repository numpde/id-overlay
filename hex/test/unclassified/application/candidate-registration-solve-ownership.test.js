import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Unclassified: candidate product law for registration solve ownership.
// Rejected alternatives:
// - shell pre-solves placement and passes `solvedPlacement` into select-mode;
// - application emits `solve-registration-placement` as an effect;
// - bootstrap owns a `registrationSolverPort`;
// - rendering derives hidden placement from pins without a product transition.
//
// Preferred model: registration solve is pure domain/application work over
// normalized registration facts already in application state. The shell may
// normalize pointer/page facts when pins are created, but it must not decide
// when or whether a Trace transition fits the overlay.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const HEX_ROOT = path.join(REPO_ROOT, "hex");

// Candidate: the codebase should have no registration solver port or solve
// effect. Pure solve belongs in domain/application imports, not at the browser
// adapter boundary.
test("candidate: registration solve has no shell port or effect vocabulary", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(HEX_ROOT)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const forbidden of [
      "registrationSolverPort",
      "solve-registration-placement",
      "command.solvedPlacement",
      "solvedPlacement:",
    ]) {
      if (source.includes(forbidden)) {
        violations.push(`${relativeToRepo(filePath)} contains ${forbidden}`);
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
