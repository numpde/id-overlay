import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  APPLICATION_MODE,
  movedPlacement,
  placementEditPayload,
  referenceImageLoadedState,
} from "./user-behavior-fixtures.js";

// Unclassified: placement edits are invalid in Trace because the underlying map
// is native there. This prevents hidden overlay manipulation through pass-through.
test("placement edits are no-ops in Trace mode", () => {
  const state = referenceImageLoadedState({
    mode: APPLICATION_MODE.TRACE,
  });
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
    placementEditPayload({ kind: "move", placement: movedPlacement() }),
  );

  assert.deepEqual(handleApplicationCommand({ state, command }), {
    state,
    effects: [],
  });
});
