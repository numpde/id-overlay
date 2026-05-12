import test from "node:test";
import assert from "node:assert/strict";

import {
  createInteractionRuntime,
} from "../../../bootstrap/interaction-runtime.js";

// Class-b, deliberately not class-a: this names today's composition seam, not a
// complete future interaction vocabulary. Adapter facts may call projection
// ports while becoming application commands, but they must not inspect product
// state.
test("interaction runtime maps adapter facts into application commands without reading state", async () => {
  const commands = [];
  const facts = [];
  const runtime = createInteractionRuntime({
    dispatchApplicationCommand(command) {
      commands.push(command);
    },
    projectRegistrationPinToggle(fact) {
      facts.push(fact);
      return {
        kind: "projected",
        existingPinId: null,
        imagePx: {
          x: 320,
          y: 240,
        },
        mapLatLon: {
          lat: -1.23,
          lon: 36.84,
        },
      };
    },
    readApplicationState() {
      assert.fail("interaction runtime must not inspect product state");
    },
  });

  await runtime.handleInteractionFact({
    kind: "registration-pin-toggle-requested",
    source: "shortcut",
  });

  assert.deepEqual(facts, [{
    kind: "registration-pin-toggle-requested",
    source: "shortcut",
  }]);
  assert.deepEqual(commands, [{
    kind: "toggle-registration-pin",
    existingPinId: null,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  }]);
});

// Class-b: projection misses are inert at the interaction seam. They are not
// application errors and the mapper must not guess a fallback command or forward
// a page gesture when it cannot form semantic product input.
test("interaction runtime dispatches nothing when pin projection misses", async () => {
  const commands = [];
  const runtime = createInteractionRuntime({
    dispatchApplicationCommand(command) {
      commands.push(command);
    },
    projectRegistrationPinToggle() {
      return {
        kind: "not-projectable",
        reason: "pointer-outside-reference-image",
      };
    },
  });

  await runtime.handleInteractionFact({
    kind: "registration-pin-toggle-requested",
    source: "overlay",
  });

  assert.deepEqual(commands, []);
});

// Class-b: the stable product rule is that placement changes enter the app as
// committed placement edits, never raw drag/wheel deltas. This stays class-b
// because the exact fact name and `projectPlacementEdit` port are harness
// vocabulary for today's shell, not a 99%-certain product law.
test("interaction runtime maps placement facts through projection to committed edits", async () => {
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
    kind: "commit-placement-edit",
    editKind: "rotate",
    placement: rotatedPlacement(),
  }]);
});

// Class-b: opacity changes are product commands, but the browser interaction
// that chooses the next opacity is not. The mapper may ask a selection port for
// the semantic value; history/durability policy stays inside `set-opacity`.
test("interaction runtime maps opacity facts through selection to set-opacity", async () => {
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
    kind: "set-opacity",
    opacity: 0.5,
  }]);
});

function rotatedPlacement() {
  return {
    x: 10,
    y: 20,
    scale: 1,
    rotationRad: 0.25,
  };
}
