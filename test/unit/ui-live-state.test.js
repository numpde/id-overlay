import test from "node:test";
import assert from "node:assert/strict";

import {
  PANEL_ACTION_EVENT,
  createInitialPanelActionState,
  reducePanelActionState,
} from "../../src/core/panel-state.js";
import { UI_EFFECT_KIND } from "../../src/core/ui-effect-model.js";
import {
  UI_PANEL_INTENT_KIND,
  UI_MODE_KIND,
  createInitialUiState,
} from "../../src/core/ui-state-model.js";
import {
  projectLiveUiState,
  resolveUiModeExecution,
  syncPanelActionStateToUiIntent,
} from "../../src/core/ui-live-state.js";

test("projectLiveUiState maps current live session and panel facts into canonical uiState", () => {
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
  const panelActionState = reducePanelActionState(
    createInitialPanelActionState(),
    PANEL_ACTION_EVENT.ARM_CLEAR_PINS_CONFIRM,
  );

  assert.deepEqual(
    projectLiveUiState({
      state: liveState,
      panelActionState,
    }),
    {
      session: {
        mode: "align",
        opacity: 0.75,
        image: liveState.image,
        placement: liveState.placement,
        registration: liveState.registration,
      },
      runtime: createInitialUiState().runtime,
      panel: {
        intent: UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM,
      },
      status: {
        messageOverride: null,
      },
    },
  );
});

test("syncPanelActionStateToUiIntent preserves panel reducer session semantics", () => {
  const initial = createInitialPanelActionState();
  const pasteArmed = syncPanelActionStateToUiIntent({
    previousPanelActionState: initial,
    nextIntent: UI_PANEL_INTENT_KIND.PASTE_ARMED,
  });

  assert.deepEqual(pasteArmed, {
    kind: "paste-armed",
    sessionId: 1,
  });

  const idle = syncPanelActionStateToUiIntent({
    previousPanelActionState: pasteArmed,
    nextIntent: UI_PANEL_INTENT_KIND.IDLE,
  });

  assert.deepEqual(idle, {
    kind: "idle",
    sessionId: 2,
  });
});

test("resolveUiModeExecution emits only the live mode command actually needed", () => {
  const previousUiState = createInitialUiState();
  const nextUiState = {
    ...previousUiState,
    session: {
      ...previousUiState.session,
      mode: UI_MODE_KIND.ALIGN,
    },
  };

  assert.deepEqual(
    resolveUiModeExecution({
      previousUiState,
      nextUiState,
      effects: [],
    }),
    {
      nextMode: UI_MODE_KIND.ALIGN,
      requestSolve: false,
    },
  );

  assert.deepEqual(
    resolveUiModeExecution({
      previousUiState: nextUiState,
      nextUiState,
      effects: [UI_EFFECT_KIND.REQUEST_REGISTRATION_SOLVE],
    }),
    {
      nextMode: UI_MODE_KIND.ALIGN,
      requestSolve: true,
    },
  );

  assert.equal(
    resolveUiModeExecution({
      previousUiState: nextUiState,
      nextUiState,
      effects: [],
    }),
    null,
  );
});
