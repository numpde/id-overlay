import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPLICATION_COMMAND_KIND,
} from "../../../application/command.js";
import {
  createInteractionRuntime,
} from "../../../bootstrap/interaction-runtime.js";

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

const INTERACTION_COMMAND_KIND = Object.freeze({
  COMMIT_PLACEMENT_EDIT: "commit-placement-edit",
  SET_OPACITY: "set-opacity",
  SET_TEMPORARY_PASS_THROUGH: "set-temporary-pass-through",
  TOGGLE_REGISTRATION_PIN: "toggle-registration-pin",
});

const FORBIDDEN_APPLICATION_COMMAND_WORDS = Object.freeze([
  "keyboard",
  "pointer",
  "mouse",
  "wheel",
  "drag",
  "gesture",
  "keydown",
  "keyup",
  "click",
  "dom",
]);

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

// Candidate: placement manipulation has one mapping path regardless of whether
// the browser source is drag, wheel, keyboard, or future handles. Geometry ports
// compute a full placement; the application receives a committed placement edit.
test("candidate: placement interaction maps through projection to commit-placement-edit", async () => {
  const commands = [];
  const facts = [];
  const runtime = createInteractionRuntime({
    dispatchApplicationCommand(command) {
      commands.push(command);
    },
    projectPlacementEdit(fact) {
      facts.push(fact);
      return {
        kind: "committed",
        editKind: "rotate",
        placement: rotatedPlacement(),
      };
    },
  });

  await runtime.handleInteractionFact({
    kind: "placement-edit-requested",
    editKind: "rotate",
    inputDelta: {
      y: -100,
    },
  });

  assert.deepEqual(facts, [{
    kind: "placement-edit-requested",
    editKind: "rotate",
    inputDelta: {
      y: -100,
    },
  }]);
  assert.deepEqual(commands, [{
    kind: INTERACTION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
    editKind: "rotate",
    placement: rotatedPlacement(),
  }]);
});

// Candidate: opacity adjustment is a semantic product command, but the browser
// mechanics that choose the next value are not. A selector/projection port may
// clamp or step the value before dispatch; history policy remains application
// owned by the set-opacity transition.
test("candidate: opacity interaction maps through selection to set-opacity", async () => {
  const commands = [];
  const facts = [];
  const runtime = createInteractionRuntime({
    dispatchApplicationCommand(command) {
      commands.push(command);
    },
    selectOpacity(fact) {
      facts.push(fact);
      return {
        kind: "selected",
        opacity: 0.5,
      };
    },
  });

  await runtime.handleInteractionFact({
    kind: "opacity-adjustment-requested",
    inputDelta: {
      y: 100,
    },
  });

  assert.deepEqual(facts, [{
    kind: "opacity-adjustment-requested",
    inputDelta: {
      y: 100,
    },
  }]);
  assert.deepEqual(commands, [{
    kind: INTERACTION_COMMAND_KIND.SET_OPACITY,
    opacity: 0.5,
  }]);
});

// Candidate: the command vocabulary needed by interaction mapping is exact and
// semantic. Adding keyboard/pointer/wheel-flavored commands would be a boundary
// regression, because those words describe how the browser observed input, not
// what the user asked the product to do.
test("candidate: interaction command vocabulary contains no browser-input mechanics", () => {
  const commandKinds = Object.values(APPLICATION_COMMAND_KIND);
  const violations = [
    ...Object.values(INTERACTION_COMMAND_KIND)
      .filter((kind) => !commandKinds.includes(kind))
      .map((kind) => `missing interaction command: ${kind}`),
    ...commandKinds.flatMap((kind) => (
      FORBIDDEN_APPLICATION_COMMAND_WORDS
        .filter((word) => kind.includes(word))
        .map((word) => `${kind} contains browser-input word ${word}`)
    )),
  ];

  assert.deepEqual(violations, []);
});

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

function rotatedPlacement() {
  return {
    x: 10,
    y: 20,
    scale: 1,
    rotationRad: 0.25,
  };
}
