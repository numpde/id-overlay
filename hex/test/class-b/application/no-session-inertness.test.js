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
