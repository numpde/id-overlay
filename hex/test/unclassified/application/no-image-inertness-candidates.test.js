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
