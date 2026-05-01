import test from "node:test";
import assert from "node:assert/strict";

import { UI_EFFECT_KIND } from "../../src/core/ui-effect-model.js";
import { UI_EVENT_KIND } from "../../src/core/ui-event-model.js";
import { transitionLiveUi } from "../../src/core/ui-live-transition.js";
import {
  createInitialPanelActionState,
  syncPanelActionState,
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
    runtime: null,
    event: {
      kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
    },
  });

  assert.equal(result.previousUiState.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.equal(result.nextUiState.panel.intent, UI_PANEL_INTENT_KIND.PASTE_ARMED);
  assert.equal(result.nextPanelActionState.kind, UI_PANEL_INTENT_KIND.PASTE_ARMED);
  assert.deepEqual(result.transitionResult.effects, [UI_EFFECT_KIND.REQUEST_PASTE_INPUT]);
});

test("transitionLiveUi preserves paste-cancel feedback as a canonical effect", () => {
  const panelActionState = syncPanelActionState(
    createInitialPanelActionState(),
    UI_PANEL_INTENT_KIND.PASTE_ARMED,
  );
  const liveState = {
    ...createInitialUiState().session,
    mode: UI_MODE_KIND.ALIGN,
  };

  const result = transitionLiveUi({
    state: liveState,
    panelActionState,
    runtime: null,
    event: {
      kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
    },
  });

  assert.equal(result.nextUiState.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.equal(result.nextPanelActionState.kind, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(result.transitionResult.effects, [
    UI_EFFECT_KIND.SHOW_PASTE_CANCELLED_FEEDBACK,
  ]);
});

test("transitionLiveUi preserves canonical mode transition effects for the live runner", () => {
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
    runtime: null,
    event: {
      kind: UI_EVENT_KIND.MODE_SELECTED,
      mode: UI_MODE_KIND.TRACE,
    },
  });

  assert.equal(result.previousUiState.session.mode, UI_MODE_KIND.ALIGN);
  assert.equal(result.nextUiState.session.mode, UI_MODE_KIND.TRACE);
  assert.deepEqual(result.transitionResult.effects, [
    UI_EFFECT_KIND.REQUEST_REGISTRATION_SOLVE,
  ]);
});
