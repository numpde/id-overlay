import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialPanelActionState,
  syncPanelActionState,
} from "../../src/core/panel-state.js";
import {
  UI_PANEL_INTENT_KIND,
} from "../../src/core/ui-state-model.js";
import {
  projectLiveUiState,
  projectLiveUiRuntime,
} from "../../src/core/ui-live-state.js";

test("projectLiveUiState maps current live session and panel facts into canonical uiState", () => {
  // Final semantic-history shape: this projection should shrink once canonical
  // UI state owns panel intent/history directly. It should not remain a place
  // where missing state shape is reassembled from unrelated stores.
  const liveState = {
    mode: "align",
    opacity: 0.75,
    image: { src: "x", width: 2, height: 3 },
    placement: { scale: 2 },
    registration: {
      pins: [{ id: 1 }],
      solvedTransform: { type: "similarity" },
      dirty: true,
    },
  };
  const runtime = {
    pointerScreenPx: { x: 12, y: 34 },
    dragMode: "move-overlay",
    isPassThroughActive: true,
  };
  const panelActionState = syncPanelActionState(
    createInitialPanelActionState(),
    UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM,
  );

  assert.deepEqual(
    projectLiveUiState({
      state: liveState,
      panelActionState,
      runtime,
    }),
    {
      session: {
        mode: "align",
        opacity: 0.75,
        image: liveState.image,
        placement: liveState.placement,
        registration: liveState.registration,
      },
      runtime: {
        pointer: {
          screenPx: { x: 12, y: 34 },
        },
        activeGesture: "move-overlay",
        inputOverride: "pass-through",
      },
      panel: {
        intent: UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM,
      },
    },
  );
});

test("panel intent sync uses the shared panel action reducer semantics", () => {
  const initial = createInitialPanelActionState();
  const pasteArmed = syncPanelActionState(initial, UI_PANEL_INTENT_KIND.PASTE_ARMED);

  assert.deepEqual(pasteArmed, {
    kind: "paste-armed",
    sessionId: 1,
  });

  const idle = syncPanelActionState(pasteArmed, UI_PANEL_INTENT_KIND.IDLE);

  assert.deepEqual(idle, {
    kind: "idle",
    sessionId: 2,
  });
});

test("projectLiveUiRuntime maps interaction runtime into canonical runtime vocabulary", () => {
  assert.deepEqual(
    projectLiveUiRuntime({
      pointerScreenPx: { x: 5, y: 6 },
      dragMode: "map-pan",
      isPassThroughActive: false,
    }),
    {
      pointer: {
        screenPx: { x: 5, y: 6 },
      },
      activeGesture: "map-pan",
      inputOverride: null,
    },
  );

  assert.deepEqual(
    projectLiveUiRuntime({
      pointerScreenPx: null,
      dragMode: null,
      isPassThroughActive: true,
    }),
    {
      pointer: {
        screenPx: null,
      },
      activeGesture: null,
      inputOverride: "pass-through",
    },
  );
});
