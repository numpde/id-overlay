import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";

// Class-a: with no session, the primary action is Paste. Activating it both
// records the pending request and emits host work. The shell must not infer
// image input by noticing state shape; product causality leaves the app as an
// explicit effect.
test("primary action with no session requests reference-image input", () => {
  const result = handleApplicationCommand({
    state: createInitialApplicationState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.deepEqual(result, {
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
      },
    },
    effects: [
      requestReferenceImageInputEffect(1),
    ],
  });
});

// Class-a: while image input is armed, activating the same primary action cancels that
// transient input flow. Cancellation must not create a session or write durable
// state; any user-facing cancellation notice is weaker copy policy.
test("primary action while awaiting input cancels transient image input", () => {
  const result = handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.equal(result.state.session, undefined);
  assert.equal(result.state.referenceImageInput, undefined);
  assert.deepEqual(result.effects, []);
});

// Class-a: clearing a loaded reference image is destructive. The primary action
// must first arm an explicit confirmation, keeping the current session intact
// and avoiding durability work until the user confirms.
test("primary action with a loaded image arms clear-image confirmation", () => {
  const state = referenceImageLoadedState();
  const result = handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.deepEqual(result, {
    state: {
      ...state,
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    effects: [],
  });
});

// Class-a: a destructive confirmation is the current panel intent. Arming it
// must replace stale status notices so the user is not shown two competing
// meanings for the same next click.
test("arming clear-image confirmation clears stale notices", () => {
  const state = {
    ...referenceImageLoadedState(),
    notice: {
      kind: "stale-notice",
    },
  };
  const result = handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.deepEqual(result, {
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    effects: [],
  });
});

// Class-a: visible Align pins are the narrower destructive target. The primary
// action must ask to clear pins before it asks to remove the whole image, which
// keeps the button behavior coherent with the visible editing state.
test("primary action with visible Align pins arms clear-pins confirmation", () => {
  const state = referenceImageLoadedState({
    pins: [firstPin()],
  });
  const result = handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.deepEqual(result, {
    state: {
      ...state,
      panelIntent: {
        kind: "confirm-clear-pins",
      },
    },
    effects: [],
  });
});

// Class-a: once the clear-pins confirmation is active, the primary action
// commits that destructive edit. It clears only registration facts, removes the
// transient confirmation, and persists the surviving image session.
test("primary action confirms clear-pins confirmation durably", () => {
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState({
        pins: [firstPin()],
      }),
      panelIntent: {
        kind: "confirm-clear-pins",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.deepEqual(result.state.session, referenceImageLoadedState().session);
  assert.equal(result.state.panelIntent, undefined);
  assert.deepEqual(result.effects, [
    durableStateChangedEffect({
      session: referenceImageLoadedState().session,
    }),
  ]);
});

// Class-a: once clear-image confirmation is active, the primary action removes
// the reference-image session and writes durable null.
test("primary action confirms clear-image confirmation durably", () => {
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.equal(result.state.session, undefined);
  assert.equal(result.state.panelIntent, undefined);
  assert.deepEqual(result.effects, [
    durableStateChangedEffect(null),
  ]);
});

// Class-a: removing an image is user-recoverable. Confirmation must record the
// durable before/after states so Undo can reload the exact removed image without
// preserving transient confirmation state.
test("primary action clear-image confirmation records undoable removal history", () => {
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.equal(result.state.history.past.length, 1);
  assert.deepEqual(result.state.history.future, []);
  assert.deepEqual(result.state.history.past[0].before, {
    session: referenceImageLoadedState().session,
  });
  assert.equal(result.state.history.past[0].after, null);
  assert.equal(result.state.panelIntent, undefined);
});

function referenceImageLoadedState({ pins } = {}) {
  const session = {
    mode: "align",
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

function durableStateChangedEffect(durableState) {
  return {
    kind: "durable-state-changed",
    durableState,
  };
}

function requestReferenceImageInputEffect(requestId) {
  return {
    kind: "request-reference-image-input",
    requestId,
  };
}
