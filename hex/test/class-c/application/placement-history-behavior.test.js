import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectApplicationView } from "../../../application/view-model.js";
import { durableStateChangedEffect } from "./durable-state-fixtures.js";
import {
  historyWithPast,
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

// Class-c: committing the current placement again is not a user-visible edit.
// It should not create history or ask for durable persistence.
test("unchanged placement edit does not create history or durability effect", () => {
  const state = referenceImageLoadedState({
    placement: identityPlacement(),
    history: historyWithPast(),
  });

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.COMMIT_PLACEMENT_EDIT,
      placementEditPayload({
        kind: "move",
        placement: identityPlacement(),
      }),
    ),
  }), {
    state,
    effects: [],
  });
});

// Class-c: these are the user-facing labels we probably want, but they depend
// on exact history record shape and tooltip wording.
test("undo and redo labels describe image removal and reload", () => {
  const state = referenceImageLoadedState({
    history: historyWithPast({
      kind: "load-reference-image",
      undoLabel: "Remove image",
      redoLabel: "Reload image",
      before: null,
      after: referenceImageDurableState(),
    }),
  });

  assert.deepEqual(selectApplicationView(state).history.undo, {
    enabled: true,
    label: "Remove image",
  });

  const undo = handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  });

  assert.equal(selectApplicationView(undo.state).history.redo.label, "Reload image");
});

// Class-c: redo should not outlive a later durable edit. The exact history
// representation is still unsettled, so this stays quarantined.
test("new durable edit clears redo history", () => {
  const state = {
    ...referenceImageLoadedState(),
    history: {
      past: [],
      future: [{
        kind: "move-overlay",
      }],
    },
  };
  const result = handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SET_OPACITY, {
      opacity: 0.5,
    }),
  });

  assert.deepEqual(result.state.history.future, []);
});

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
