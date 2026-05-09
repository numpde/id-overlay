import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { durableStateChangedEffect } from "./durable-state-fixtures.js";
import {
  identityPlacement,
  movedPlacement,
  placementEditPayload,
  rotatedPlacement,
  scaledPlacement,
} from "./placement-fixtures.js";
import {
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-c: placement edits should be semantic user-visible history, but the
// exact history record schema and labels are still proposal-level.
test("move rotate and scale placement edits create semantic history records", () => {
  for (const { kind, placement, undoLabel, redoLabel } of [
    {
      kind: "move",
      placement: movedPlacement(),
      undoLabel: "Undo move overlay",
      redoLabel: "Redo move overlay",
    },
    {
      kind: "rotate",
      placement: rotatedPlacement(),
      undoLabel: "Undo rotate overlay",
      redoLabel: "Redo rotate overlay",
    },
    {
      kind: "scale",
      placement: scaledPlacement(),
      undoLabel: "Undo scale overlay",
      redoLabel: "Redo scale overlay",
    },
  ]) {
    const result = handleApplicationCommand({
      state: referenceImageLoadedState(),
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
        placementEditPayload({ kind, placement }),
      ),
    });

    assert.deepEqual(result.state.session.placement, placement);
    assert.deepEqual(result.state.history.past.at(-1), {
      kind: `${kind}-overlay`,
      undoLabel,
      redoLabel,
      before: {
        placement: identityPlacement(),
      },
      after: {
        placement,
      },
    });
    assert.deepEqual(result.effects, [
      durableStateChangedEffect(referenceImageDurableState({ placement })),
    ]);
  }
});
