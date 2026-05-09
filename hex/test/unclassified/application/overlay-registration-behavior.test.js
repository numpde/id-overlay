import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Unclassified: opacity is visible and durable, but legacy behavior deliberately
// kept it out of undo/redo. That posture matters because opacity adjustment can
// be a frequent viewing aid, not a semantic placement step.
test("opacity changes are durable but not undoable", () => {
  const state = loadedState({
    history: {
      past: [{
        kind: "move-overlay",
        undoLabel: "Undo move overlay",
        redoLabel: "Redo move overlay",
        before: {
          placement: identityPlacement(),
        },
        after: {
          placement: movedPlacement(),
        },
      }],
      future: [],
    },
  });

  const result = step(state, {
    kind: "set-overlay-opacity",
    opacity: 0.42,
  });

  assert.equal(result.state.session.opacity, 0.42);
  assert.deepEqual(result.state.history, state.history);
  assert.deepEqual(result.effects, [{
    kind: "durable-state-changed",
    durableState: {
      session: result.state.session,
    },
  }]);
});

// Unclassified: pin toggling is a product edit, not overlay-local state. It
// should add a projected pin, remove an existing pin by id, and persist only the
// resulting durable session.
test("pin toggle adds and removes registration pins in Align mode", () => {
  const added = step(loadedState(), createApplicationCommand(
    APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
    {
      existingPinId: null,
      imagePx: {
        x: 320,
        y: 240,
      },
      mapLatLon: {
        lat: -1.23,
        lon: 36.84,
      },
    },
  ));

  assert.deepEqual(added.state.session.registration.pins, [firstPin()]);
  assert.deepEqual(added.state.notice, {
    kind: "added-pin",
    pinId: 1,
  });

  const removed = step(added.state, createApplicationCommand(
    APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
    {
      existingPinId: 1,
      imagePx: {
        x: 320,
        y: 240,
      },
      mapLatLon: {
        lat: -1.23,
        lon: 36.84,
      },
    },
  ));

  assert.deepEqual(removed.state.session.registration.pins, []);
  assert.deepEqual(removed.state.notice, {
    kind: "removed-pin",
    pinId: 1,
  });
});

// Unclassified: switching to Trace is the moment registration becomes useful
// to the user. If enough pins exist, the app should fit the overlay and mark the
// solve as clean without requiring a separate hidden command.
test("switching to Trace solves placement from two registration pins", () => {
  const state = loadedState({
    pins: [firstPin(), secondPin()],
  });

  const result = step(state, createApplicationCommand(
    APPLICATION_COMMAND_KIND.SELECT_MODE,
    {
      mode: "trace",
    },
  ));

  assert.equal(result.state.session.mode, "trace");
  assert.deepEqual(result.state.session.placement, solvedPlacement());
  assert.deepEqual(result.state.session.registration.solvedPlacement, solvedPlacement());
  assert.deepEqual(result.state.notice, {
    kind: "fit-reference-image-from-pins",
    pinCount: 2,
  });
});

function step(state, command) {
  return handleApplicationCommand({
    state,
    command,
  });
}

function loadedState({
  history = {
    past: [],
    future: [],
  },
  pins,
} = {}) {
  const state = {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
      placement: identityPlacement(),
    },
    history,
  };
  if (pins !== undefined) {
    state.session.registration = {
      pins,
    };
  }
  return state;
}

function identityPlacement() {
  return {
    x: 0,
    y: 0,
    scale: 1,
    rotationRad: 0,
  };
}

function movedPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  };
}

function solvedPlacement() {
  return {
    x: 120,
    y: 90,
    scale: 1.25,
    rotationRad: 0.1,
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
