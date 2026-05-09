import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";

// Class-a: Align is an overlay-editing mode. With no reference image, selecting
// Align must not create hidden session state or leave native Trace posture.
test("selecting Align with no reference image is a no-op", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
    mode: "align",
  });

  assert.deepEqual(handleApplicationCommand({ state, command }), {
    state,
    effects: [],
  });
});

// Class-a: registration pins belong to a visible reference image. With no
// session, pin commands must not create hidden registration state.
test("pin toggle is inert with no reference image", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(
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
  );

  assert.deepEqual(handleApplicationCommand({ state, command }), {
    state,
    effects: [],
  });
});

// Class-a: placement belongs to an overlay. With no reference image there is no
// overlay to move, so placement commands must not create hidden placement state.
test("placement edit is inert with no reference image", () => {
  const state = createInitialApplicationState();
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
