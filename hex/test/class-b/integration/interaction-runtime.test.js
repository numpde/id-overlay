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
  const runtime = createInteractionRuntime({
    dispatchCommand(command) {
      commands.push(command);
    },
    projectCurrentPointerForPinToggle() {
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
    kind: "keyboard-pin-toggle-requested",
  });

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
