import test from "node:test";
import assert from "node:assert/strict";

import { runPanelLiveEffects } from "../../src/content/panel-live-effects.js";
import { UI_EFFECT_KIND } from "../../src/core/ui-effect-model.js";
import { PANEL_FEEDBACK_ACTION } from "../../src/core/presentation.js";
import { createInitialUiState, UI_MODE_KIND } from "../../src/core/ui-state-model.js";

test("runPanelLiveEffects maps semantic effects to panel side effects", async () => {
  const calls = [];
  const transients = [];
  const previousUiState = createInitialUiState();
  const nextUiState = {
    ...previousUiState,
    session: {
      ...previousUiState.session,
      mode: UI_MODE_KIND.ALIGN,
    },
  };
  const image = { src: "data:image/png;base64,abc", width: 10, height: 5 };

  await runPanelLiveEffects({
    previousUiState,
    nextUiState,
    effects: [
      UI_EFFECT_KIND.REQUEST_PASTE_INPUT,
      UI_EFFECT_KIND.CLEAR_PINS,
      UI_EFFECT_KIND.CLEAR_IMAGE,
      UI_EFFECT_KIND.UNDO_SESSION,
      UI_EFFECT_KIND.REDO_SESSION,
      UI_EFFECT_KIND.SHOW_PASTE_CANCELLED_FEEDBACK,
      UI_EFFECT_KIND.START_PANEL_TIMEOUT,
      UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    ],
    nextPanelActionState: { sessionId: 7 },
  }, {
    logger: {
      info(message) {
        calls.push(`log:${message}`);
      },
    },
    interactions: {
      applyResolvedModeTransition(modeExecution) {
        calls.push(`mode:${modeExecution.nextMode}:${modeExecution.requestSolve}`);
      },
      clearImage() {
        calls.push("clear-image");
      },
      clearPins() {
        calls.push("clear-pins");
      },
      undoSessionHistory() {
        calls.push("undo");
        return { label: "Moved overlay" };
      },
      redoSessionHistory() {
        calls.push("redo");
        return { label: "Moved overlay" };
      },
    },
    statusController: {
      showPanelFeedback(action, payload) {
        transients.push({ action, payload });
      },
      clearTransient() {
        calls.push("clear-transient");
      },
    },
    async readPasteInput({ sessionId }) {
      calls.push(`read-paste:${sessionId}`);
      return image;
    },
    async dispatchCanonicalUiEvent(event) {
      calls.push(`dispatch:${event.kind}:${event.image.src}`);
    },
    async startPanelTimeout() {
      calls.push("start-timeout");
    },
    async cancelPanelTimeout() {
      calls.push("cancel-timeout");
    },
  });

  assert.deepEqual(calls, [
    "mode:align:false",
    "log:Paste requested",
    "read-paste:7",
    `dispatch:paste-succeeded:${image.src}`,
    "log:Cleared pins from canonical UI effect",
    "clear-pins",
    "log:Cleared image from canonical destructive action",
    "clear-image",
    "clear-transient",
    "undo",
    "clear-transient",
    "redo",
    "log:Cancelled paste capture",
    "start-timeout",
    "cancel-timeout",
  ]);
  assert.deepEqual(transients, [
    {
      action: PANEL_FEEDBACK_ACTION.CLEAR_IMAGE,
      payload: undefined,
    },
    {
      action: PANEL_FEEDBACK_ACTION.UNDO,
      payload: {
        historyDescriptor: { label: "Moved overlay" },
      },
    },
    {
      action: PANEL_FEEDBACK_ACTION.REDO,
      payload: {
        historyDescriptor: { label: "Moved overlay" },
      },
    },
    {
      action: PANEL_FEEDBACK_ACTION.PASTE_CANCELLED,
      payload: undefined,
    },
  ]);
});
