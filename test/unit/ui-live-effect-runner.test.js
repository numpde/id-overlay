import test from "node:test";
import assert from "node:assert/strict";

import { UI_EFFECT_KIND } from "../../src/core/ui-effect-model.js";
import { runUiLiveEffects } from "../../src/core/ui-live-effect-runner.js";
import { createInitialUiState, UI_MODE_KIND } from "../../src/core/ui-state-model.js";

test("runUiLiveEffects executes semantic handlers in order and ignores unknown effects", async () => {
  // Final semantic-history shape: this should stop asserting mode inference and
  // undo/redo side-effect dispatch. Those should be reducer-owned semantic
  // transitions rather than live-effect responsibilities.
  const seen = [];
  const previousUiState = createInitialUiState();
  const nextUiState = {
    ...previousUiState,
    session: {
      ...previousUiState.session,
      mode: UI_MODE_KIND.ALIGN,
    },
  };

  await runUiLiveEffects(
    {
      previousUiState,
      nextUiState,
      effects: [
        UI_EFFECT_KIND.REQUEST_PASTE_INPUT,
        UI_EFFECT_KIND.REQUEST_REGISTRATION_SOLVE,
        UI_EFFECT_KIND.SHOW_PASTE_CANCELLED_FEEDBACK,
        UI_EFFECT_KIND.CLEAR_PINS,
        UI_EFFECT_KIND.UNDO_SESSION,
        UI_EFFECT_KIND.REDO_SESSION,
        "unknown-effect",
        UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      ],
    },
    {
      applyResolvedModeTransition: async ({ nextMode, requestSolve }) => {
        seen.push(`mode:${nextMode}:${requestSolve}`);
      },
      requestPasteInput: async () => {
        // Final semantic-history shape: keep paste as an external effect; avoid
        // using this runner to perform durable session changes.
        seen.push("paste");
      },
      clearPins: async () => {
        seen.push("clear-pins");
      },
      clearImage: async () => {
        seen.push("clear-image");
      },
      undoSession: async () => {
        seen.push("undo");
      },
      redoSession: async () => {
        seen.push("redo");
      },
      showPasteCancelledFeedback: async () => {
        seen.push("paste-cancelled");
      },
      startPanelTimeout: async () => {
        seen.push("start-timeout");
      },
      cancelPanelTimeout: async () => {
        seen.push("cancel-timeout");
      },
    },
  );

  assert.deepEqual(seen, [
    "mode:align:true",
    "paste",
    "paste-cancelled",
    "clear-pins",
    "undo",
    "redo",
    "cancel-timeout",
  ]);
});
