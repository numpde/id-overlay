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
