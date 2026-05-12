import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Unclassified: candidate boundary law for interaction command mapping.
//
// Rejected alternatives:
// - UI adapters dispatch application commands directly. That makes keyboard,
//   pointer, wheel, and hit-testing adapters know product command vocabulary.
// - The application accepts raw input facts. That leaks browser mechanics into
//   replayable product causality and makes command validation depend on DOM
//   vocabulary.
// - The shell checks current product mode before dispatching. That creates a
//   second state machine beside the application reducer.
//
// Preferred model: adapters emit browser-independent interaction facts; this
// runtime maps those facts through projection/selection ports into semantic
// application commands. The mapper may ask "what did this screen interaction
// mean?", but only the application may decide whether that command is valid in
// the current product state.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const HEX_ROOT = path.join(REPO_ROOT, "hex");
const INTERACTION_RUNTIME_PATH = path.join(HEX_ROOT, "bootstrap/interaction-runtime.js");

const FORBIDDEN_INTERACTION_RUNTIME_STATE_READS = Object.freeze([
  // The interaction runtime should not branch on product state. If a command is
  // invalid in Trace/no-session/etc., the application transition owns that no-op.
  "getState",
  "readApplicationState",
  "selectApplicationView",
  ".session",
  ".mode",
  ".registration",
  ".placement",
  ".opacity",
  ".history",
]);

// Candidate: interaction mapping is not a second reducer. It may call
// projection/selection ports and dispatch application commands; it must not
// inspect session fields, view-model fields, or mode-specific policy.
test("candidate: interaction runtime source does not read product state", () => {
  const source = fs.readFileSync(INTERACTION_RUNTIME_PATH, "utf8");
  assert.deepEqual(
    FORBIDDEN_INTERACTION_RUNTIME_STATE_READS.filter((snippet) => source.includes(snippet)),
    [],
  );
});
