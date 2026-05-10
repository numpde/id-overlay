import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Candidate: clearing pins is a direct application behavior, not a panel hack.
// The image session survives, registration facts disappear, and persistence
// records only the new durable session. Keep this unclassified until we decide
// whether empty registration should be represented as absent or as pins: [].
test("clearing registration pins in Align keeps the image and persists the cleared session", () => {
  const state = referenceImageLoadedState({
    mode: "align",
    pins: [firstPin(), secondPin()],
  });

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_REGISTRATION_PINS),
  }), {
    state: {
      session: {
        mode: "align",
        referenceImage: normalizedReferenceImage(),
      },
      notice: {
        kind: "cleared-pins",
        count: 2,
      },
    },
    effects: [
      durableStateChangedEffect({
        session: {
          mode: "align",
          referenceImage: normalizedReferenceImage(),
        },
      }),
    ],
  });
});

// Candidate: Trace is always a valid loaded-image mode, but fitting is only a
// consequence of an explicit successful solve. A one-pin switch must not invent
// placement, solvedPlacement, or a fit notice.
test("switching to Trace without a solved registration changes mode only", () => {
  const state = referenceImageLoadedState({
    mode: "align",
    pins: [firstPin()],
  });
  const expectedState = referenceImageLoadedState({
    mode: "trace",
    pins: [firstPin()],
  });

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  }), {
    state: expectedState,
    effects: [
      durableStateChangedEffect({
        session: expectedState.session,
      }),
    ],
  });
});

function referenceImageLoadedState({ mode, pins = [] }) {
  const session = {
    mode,
    referenceImage: normalizedReferenceImage(),
  };
  if (pins.length > 0) {
    session.registration = {
      pins,
    };
  }
  return {
    session,
  };
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  };
}

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 520,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 38.84,
    },
  };
}

function durableStateChangedEffect(durableState) {
  return {
    kind: "durable-state-changed",
    durableState,
  };
}
