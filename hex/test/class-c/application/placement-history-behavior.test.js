import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { durableStateChangedEffect } from "./durable-state-fixtures.js";
import {
  historyWithPast,
  identityPlacement,
  movedPlacement,
} from "./placement-fixtures.js";
import {
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-c: opacity visibly changes rendering and likely should persist, but the
// non-undoable policy is still a product decision rather than architecture.
test("opacity changes are durable but not undoable", () => {
  const state = referenceImageLoadedState({
    history: historyWithPast({
      kind: "move-overlay",
      undoLabel: "Undo move overlay",
      redoLabel: "Redo move overlay",
      before: {
        placement: identityPlacement(),
      },
      after: {
        placement: movedPlacement(),
      },
    }),
  });
  const result = handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SET_OPACITY, {
      opacity: 0.5,
    }),
  });

  assert.deepEqual(result.state.session.opacity, 0.5);
  assert.deepEqual(result.state.history, state.history);
  assert.deepEqual(result.effects, [
    durableStateChangedEffect(referenceImageDurableState({
      opacity: 0.5,
    })),
  ]);
});
