import test from "node:test";
import assert from "node:assert/strict";

import { UI_EFFECT_KIND } from "../../src/core/ui-effect-model.js";
import { UI_EVENT_KIND } from "../../src/core/ui-event-model.js";
import {
  UI_LIVE_FEEDBACK_KIND,
  transitionLiveUi,
} from "../../src/core/ui-live-transition.js";
import {
  createInitialPanelActionState,
  reducePanelActionState,
  PANEL_ACTION_EVENT,
} from "../../src/core/panel-state.js";
import {
  createInitialUiState,
  UI_MODE_KIND,
  UI_PANEL_INTENT_KIND,
} from "../../src/core/ui-state-model.js";

test("transitionLiveUi projects, routes, and syncs panel intent for main-action paste arming", () => {
  const liveState = {
    ...createInitialUiState().session,
    mode: UI_MODE_KIND.ALIGN,
  };
  const panelActionState = createInitialPanelActionState();

  const result = transitionLiveUi({
    state: liveState,
    panelActionState,
    event: {
      kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
    },
  });

  assert.equal(result.previousUiState.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.equal(result.nextUiState.panel.intent, UI_PANEL_INTENT_KIND.PASTE_ARMED);
  assert.equal(result.nextPanelActionState.kind, UI_PANEL_INTENT_KIND.PASTE_ARMED);
  assert.deepEqual(result.transitionResult.effects, [UI_EFFECT_KIND.REQUEST_PASTE_INPUT]);
  assert.equal(result.modeExecution, null);
  assert.equal(result.feedbackKind, null);
});

test("transitionLiveUi resolves paste-cancel feedback when the main action disarms paste", () => {
  const panelActionState = reducePanelActionState(
    createInitialPanelActionState(),
    PANEL_ACTION_EVENT.ARM_PASTE,
  );
  const liveState = {
    ...createInitialUiState().session,
    mode: UI_MODE_KIND.ALIGN,
  };

  const result = transitionLiveUi({
    state: liveState,
    panelActionState,
    event: {
      kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
    },
  });

  assert.equal(result.nextUiState.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.equal(result.nextPanelActionState.kind, UI_PANEL_INTENT_KIND.IDLE);
  assert.equal(result.feedbackKind, UI_LIVE_FEEDBACK_KIND.PASTE_CANCELLED);
});

test("transitionLiveUi resolves mode execution from canonical mode transitions", () => {
  const liveState = {
    ...createInitialUiState().session,
    mode: UI_MODE_KIND.ALIGN,
    image: { id: "image" },
    registration: {
      pins: [{ id: 1 }, { id: 2 }],
      solvedTransform: null,
      dirty: true,
    },
  };

  const result = transitionLiveUi({
    state: liveState,
    panelActionState: createInitialPanelActionState(),
    event: {
      kind: UI_EVENT_KIND.MODE_SELECTED,
      mode: UI_MODE_KIND.TRACE,
    },
  });

  assert.deepEqual(result.modeExecution, {
    nextMode: UI_MODE_KIND.TRACE,
    requestSolve: true,
  });
  assert.equal(result.feedbackKind, null);
});
