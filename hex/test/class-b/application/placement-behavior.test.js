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

// Class-b, not class-a: equality details may grow if placement gains fields or
// tolerances, but duplicate commits are not user-visible edits. They must not
// create persistence work just because an adapter reports the final pointer-up.
test("unchanged placement edit is inert", () => {
  const state = referenceImageLoadedState({
    placement: movedPlacement(),
  });

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
      placementEditPayload({
        kind: "move",
        placement: movedPlacement(),
      }),
    ),
  }), {
    state,
    effects: [],
  });
});
