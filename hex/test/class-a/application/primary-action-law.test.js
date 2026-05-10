import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";

// Class-a: with no session, the primary action is Paste. Activating it arms
// reference-image input; the actual image still enters later as correlated data.
test("primary action with no session waits for a pasted reference image", () => {
  const result = handleApplicationCommand({
    state: createInitialApplicationState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.deepEqual(result, {
    state: {
      referenceImageInput: {
        status: "awaiting-paste",
        requestId: 1,
      },
    },
    effects: [],
  });
});

// Class-a: while paste is armed, activating the same primary action cancels that
// transient input flow. Cancellation must not create a session or write durable
// state; any user-facing cancellation notice is weaker copy policy.
test("primary action while awaiting paste cancels transient image input", () => {
  const result = handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-paste",
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
