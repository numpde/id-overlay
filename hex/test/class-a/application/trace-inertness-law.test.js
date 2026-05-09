import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: Trace is the native-map posture. Overlay placement commands can
// still arrive from stale UI wiring, but they must not mutate hidden state.
test("placement edits are no-ops in Trace mode", () => {
  const state = referenceImageLoadedState({
    mode: "trace",
  });
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
    {
      kind: "move",
      placement: {
        x: 80,
        y: 40,
        scale: 1,
        rotationRad: 0,
      },
    },
  );

  assert.deepEqual(handleApplicationCommand({ state, command }), {
    state,
    effects: [],
  });
});

// Class-a: Trace hides registration pins. Pin commands may still be delivered,
// but they must not edit invisible registration state.
test("pin edits and clear-pins are no-ops in Trace mode", () => {
  const state = referenceImageLoadedState({
    mode: "trace",
    pins: [{
      id: 1,
      imagePx: {
        x: 320,
        y: 240,
      },
      mapLatLon: {
        lat: -1.23,
        lon: 36.84,
      },
    }],
  });

  for (const command of [
    createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      {
        existingPinId: null,
        imagePx: {
          x: 520,
          y: 240,
        },
        mapLatLon: {
          lat: -1.23,
          lon: 38.84,
        },
      },
    ),
    createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_REGISTRATION_PINS),
  ]) {
    assert.deepEqual(handleApplicationCommand({ state, command }), {
      state,
      effects: [],
    });
  }
});

function referenceImageLoadedState({ mode, pins }) {
  const session = {
    mode,
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
  }
  return {
    session,
  };
}
