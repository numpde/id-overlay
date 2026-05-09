import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  movedPlacement,
  placementEditPayload,
} from "./placement-fixtures.js";
import {
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b: Trace is native-map posture. Overlay placement edits must be inert
// there, though the edit command/payload vocabulary is still application API.
test("placement edits are no-ops in Trace mode", () => {
  const state = referenceImageLoadedState({
    mode: "trace",
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
