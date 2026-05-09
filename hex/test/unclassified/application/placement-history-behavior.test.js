import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  APPLICATION_MODE,
  durableStateChangedEffect,
  historyWithPast,
  identityPlacement,
  movedPlacement,
  placementEditPayload,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./user-behavior-fixtures.js";

// Unclassified: opacity affects the rendering but should not create history
// pressure. Undo/redo should stay focused on image, pins, fit, and placement.
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
