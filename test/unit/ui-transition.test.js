import test from "node:test";
import assert from "node:assert/strict";

import { UI_EFFECT_KIND } from "../../src/core/ui-effect-model.js";
import { UI_EVENT_KIND } from "../../src/core/ui-event-model.js";
import {
  createInitialUiState,
  UI_MODE_KIND,
  UI_PANEL_INTENT_KIND,
} from "../../src/core/ui-state-model.js";
import { transitionUiState } from "../../src/core/ui-transition.js";

test("ui transition routes main-action events to the main-action family", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.ALIGN,
    },
  };

  const result = transitionUiState(state, {
    kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
  });

  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.PASTE_ARMED);
  assert.deepEqual(result.effects, [UI_EFFECT_KIND.REQUEST_PASTE_INPUT]);
});

test("ui transition routes mode events to the mode family", () => {
  const state = createInitialUiState();

  const result = transitionUiState(state, {
    kind: UI_EVENT_KIND.MODE_SELECTED,
    mode: UI_MODE_KIND.ALIGN,
  });

  assert.equal(result.state.session.mode, UI_MODE_KIND.TRACE);
  assert.deepEqual(result.effects, []);
});

test("ui transition routes registration events to the registration family", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.ALIGN,
      image: { id: "image" },
      registration: {
        pins: [{ id: 1 }],
        solvedTransform: null,
        dirty: true,
      },
    },
  };

  const result = transitionUiState(state, {
    kind: UI_EVENT_KIND.CLEAR_PINS_TRIGGERED,
  });

  assert.deepEqual(result.state.session.registration, {
    pins: [],
    solvedTransform: null,
    dirty: false,
  });
  // Final semantic-history shape: this should keep CANCEL_PANEL_TIMEOUT if the
  // timer remains external, but CLEAR_PINS should disappear as a durable live
  // mutation effect.
  assert.deepEqual(result.effects, [
    UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    UI_EFFECT_KIND.CLEAR_PINS,
  ]);
});

test("ui transition routes history events to the history family", () => {
  // Final semantic-history shape: this should assert reducer-owned history
  // record consumption rather than an UNDO_SESSION effect.
  const base = createInitialUiState();
  const state = {
    ...base,
    panel: {
      intent: UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM,
    },
  };

  const result = transitionUiState(state, {
    kind: UI_EVENT_KIND.UNDO_TRIGGERED,
  });

  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(result.effects, [
    UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    UI_EFFECT_KIND.UNDO_SESSION,
  ]);
});

test("ui transition leaves unsupported events as a pure no-op", () => {
  const state = createInitialUiState();

  const result = transitionUiState(state, {
    kind: "unsupported",
  });

  assert.equal(result.state, state);
  assert.deepEqual(result.effects, []);
});

test("ui transition routes paste outcome events to the main-action family", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.ALIGN,
    },
    panel: {
      intent: "paste-armed",
    },
  };

  const result = transitionUiState(state, {
    kind: UI_EVENT_KIND.PASTE_CANCELLED,
  });

  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(result.effects, []);
});

test("ui transition routes solve outcome events to the mode family", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.TRACE,
      image: { id: "image" },
      registration: {
        pins: [{ id: 1 }, { id: 2 }],
        solvedTransform: null,
        dirty: true,
      },
    },
  };
  const solvedTransform = {
    type: "similarity",
    scale: 1.2,
    rotationRad: 0.1,
    translate: { x: 4, y: 5 },
    pinCount: 2,
  };

  const result = transitionUiState(state, {
    kind: UI_EVENT_KIND.SOLVE_SUCCEEDED,
    solvedTransform,
  });

  assert.deepEqual(result.state.session.registration.solvedTransform, solvedTransform);
  assert.equal(result.state.session.registration.dirty, false);
});
