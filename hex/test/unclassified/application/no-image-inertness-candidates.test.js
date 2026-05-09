import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import {
  placementEditPayload,
  movedPlacement,
} from "../../class-b/application/placement-fixtures.js";
import {
  pinTogglePayload,
  secondPin,
} from "../../class-b/application/reference-image-fixtures.js";

// Unclassified candidate: pin editing requires a visible image. No-session
// commands must not create hidden registration state.
test("pin toggle is inert with no reference image", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
    pinTogglePayload({
      imagePx: secondPin().imagePx,
      mapLatLon: secondPin().mapLatLon,
    }),
  );

  assert.deepEqual(handleApplicationCommand({ state, command }), {
    state,
    effects: [],
  });
});

// Unclassified candidate: placement editing requires an overlay. No-session
// placement edits must not create hidden placement state.
test("placement edit is inert with no reference image", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
    placementEditPayload({ kind: "move", placement: movedPlacement() }),
  );

  assert.deepEqual(handleApplicationCommand({ state, command }), {
    state,
    effects: [],
  });
});
