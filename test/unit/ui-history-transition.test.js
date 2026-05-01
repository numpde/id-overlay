import test from "node:test";
import assert from "node:assert/strict";

import { UI_EFFECT_KIND } from "../../src/core/ui-effect-model.js";
import { UI_EVENT_KIND } from "../../src/core/ui-event-model.js";
import {
  createInitialUiState,
  UI_PANEL_INTENT_KIND,
} from "../../src/core/ui-state-model.js";
import { transitionHistory } from "../../src/core/ui-history-transition.js";

test("undo and redo reset transient panel intent and emit one canonical history effect", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    panel: {
      intent: UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM,
    },
  };

  const undoResult = transitionHistory(state, {
    kind: UI_EVENT_KIND.UNDO_TRIGGERED,
  });
  assert.equal(undoResult.state.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(undoResult.effects, [
    UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    UI_EFFECT_KIND.UNDO_SESSION,
  ]);

  const redoResult = transitionHistory(state, {
    kind: UI_EVENT_KIND.REDO_TRIGGERED,
  });
  assert.equal(redoResult.state.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(redoResult.effects, [
    UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    UI_EFFECT_KIND.REDO_SESSION,
  ]);
});

test("history transition leaves unsupported events as a pure no-op", () => {
  const state = createInitialUiState();
  const result = transitionHistory(state, { kind: "unsupported" });
  assert.equal(result.state, state);
  assert.deepEqual(result.effects, []);
});
