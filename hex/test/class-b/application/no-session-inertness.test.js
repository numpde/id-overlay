import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import {
  movedPlacement,
  placementEditPayload,
} from "./placement-fixtures.js";
import {
  pinTogglePayload,
  secondPin,
} from "./reference-image-fixtures.js";

// Class-b: pin editing needs a visible reference image. With no session, a pin
// command must not create hidden registration state.
test("pin toggle is inert with no reference image", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
    pinTogglePayload({
      imagePx: secondPin().imagePx,
      mapLatLon: secondPin().mapLatLon,
    }),
  );

  assertApplicationResult(handleApplicationCommand({ state, command }), {
    state,
    effects: [],
  });
});

// Class-b: placement editing needs an overlay. With no session, placement
// commands must not create hidden placement state.
test("placement edit is inert with no reference image", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
    placementEditPayload({ kind: "move", placement: movedPlacement() }),
  );

  assertApplicationResult(handleApplicationCommand({ state, command }), {
    state,
    effects: [],
  });
});
