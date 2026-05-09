import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectApplicationView } from "../../../application/view-model.js";
import {
  APPLICATION_MODE,
  durableStateChangedEffect,
  historyWithPast,
  identityPlacement,
  movedPlacement,
  placementEditPayload,
  referenceImageDurableState,
  referenceImageLoadedState,
  rotatedPlacement,
  scaledPlacement,
} from "./user-behavior-fixtures.js";

// Unclassified: placement edits are visible user edits, so they enter history
// by semantic kind. Pointer drag mechanics must not define undo vocabulary.
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

// Unclassified: image load/removal is user-visible history. The labels should
// say what will happen, not expose generic "undo change" implementation terms.
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
