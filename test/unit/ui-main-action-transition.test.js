import test from "node:test";
import assert from "node:assert/strict";

import { UI_EFFECT_KIND } from "../../src/core/ui-effect-model.js";
import { UI_EVENT_KIND } from "../../src/core/ui-event-model.js";
import {
  resolveMainActionBasis,
  resolveMainActionTarget,
  transitionMainAction,
  UI_MAIN_ACTION_TARGET_KIND,
} from "../../src/core/ui-main-action-transition.js";
import {
  createInitialUiState,
  UI_MODE_KIND,
  UI_PANEL_INTENT_KIND,
} from "../../src/core/ui-state-model.js";

test("main action target is derived from image and pins", () => {
  const empty = createInitialUiState();
  assert.equal(resolveMainActionTarget(empty), UI_MAIN_ACTION_TARGET_KIND.PASTE);

  const imageOnly = {
    ...empty,
    session: {
      ...empty.session,
      image: { id: "image" },
      mode: UI_MODE_KIND.ALIGN,
    },
  };
  assert.equal(resolveMainActionTarget(imageOnly), UI_MAIN_ACTION_TARGET_KIND.CLEAR_IMAGE);

  const withPins = {
    ...imageOnly,
    session: {
      ...imageOnly.session,
      registration: {
        ...imageOnly.session.registration,
        pins: [{ id: 1 }],
        dirty: true,
      },
    },
  };
  assert.equal(resolveMainActionTarget(withPins), UI_MAIN_ACTION_TARGET_KIND.CLEAR_PINS);
});

test("main action basis captures only the local semantic distinctions", () => {
  const state = {
    ...createInitialUiState(),
    session: {
      ...createInitialUiState().session,
      mode: UI_MODE_KIND.ALIGN,
      image: { id: "image" },
    },
    panel: {
      intent: UI_PANEL_INTENT_KIND.IDLE,
    },
  };

  assert.deepEqual(resolveMainActionBasis(state), {
    intent: UI_PANEL_INTENT_KIND.IDLE,
    target: UI_MAIN_ACTION_TARGET_KIND.CLEAR_IMAGE,
    canPasteImage: true,
  });
});

test("main action does nothing from empty trace while paste is unavailable", () => {
  const state = createInitialUiState();
  const result = transitionMainAction(state, {
    kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
  });
  assert.equal(result.state, state);
  assert.deepEqual(result.effects, []);
});

test("main action arms paste from empty align and requests paste input", () => {
  const state = {
    ...createInitialUiState(),
    session: {
      ...createInitialUiState().session,
      mode: UI_MODE_KIND.ALIGN,
    },
  };
  const result = transitionMainAction(state, {
    kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
  });

  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.PASTE_ARMED);
  assert.deepEqual(result.effects, [UI_EFFECT_KIND.REQUEST_PASTE_INPUT]);
});

test("main action cancels paste arming on second click", () => {
  const state = {
    ...createInitialUiState(),
    session: {
      ...createInitialUiState().session,
      mode: UI_MODE_KIND.ALIGN,
    },
    panel: {
      intent: UI_PANEL_INTENT_KIND.PASTE_ARMED,
    },
  };
  const result = transitionMainAction(state, {
    kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
  });

  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(result.effects, []);
});

test("paste success loads an image session and enters align", () => {
  const state = {
    ...createInitialUiState(),
    session: {
      ...createInitialUiState().session,
      mode: UI_MODE_KIND.ALIGN,
    },
    panel: {
      intent: UI_PANEL_INTENT_KIND.PASTE_ARMED,
    },
  };
  const image = { width: 400, height: 200 };
  const placement = { type: "similarity", scale: 1 };

  const result = transitionMainAction(state, {
    kind: UI_EVENT_KIND.PASTE_SUCCEEDED,
    image,
    placement,
  });

  assert.deepEqual(result.state.session, {
    ...state.session,
    mode: UI_MODE_KIND.ALIGN,
    image,
    placement,
    registration: {
      pins: [],
      solvedTransform: null,
      dirty: false,
    },
  });
  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(result.effects, []);
});

test("late paste success is ignored once paste is no longer armed", () => {
  const state = {
    ...createInitialUiState(),
    session: {
      ...createInitialUiState().session,
      mode: UI_MODE_KIND.ALIGN,
    },
  };

  const result = transitionMainAction(state, {
    kind: UI_EVENT_KIND.PASTE_SUCCEEDED,
    image: { width: 1, height: 1 },
    placement: { type: "similarity" },
  });

  assert.equal(result.state, state);
  assert.deepEqual(result.effects, []);
});

test("main action arms clear-pins confirmation when pins exist", () => {
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

  const result = transitionMainAction(state, {
    kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
  });

  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM);
  assert.deepEqual(result.effects, [UI_EFFECT_KIND.START_PANEL_TIMEOUT]);
});

test("main action clears pins after confirmation", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.ALIGN,
      image: { id: "image" },
      registration: {
        pins: [{ id: 1 }],
        solvedTransform: { type: "similarity" },
        dirty: true,
      },
    },
    panel: {
      intent: UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM,
    },
  };

  const result = transitionMainAction(state, {
    kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
  });

  assert.deepEqual(result.state.session.registration, {
    pins: [],
    solvedTransform: null,
    dirty: false,
  });
  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(result.effects, [UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT]);
});

test("stale clear-pins confirmation resets back to idle instead of escalating", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.ALIGN,
      image: { id: "image" },
      registration: {
        pins: [],
        solvedTransform: null,
        dirty: false,
      },
    },
    panel: {
      intent: UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM,
    },
  };

  const result = transitionMainAction(state, {
    kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
  });

  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(result.effects, []);
});

test("main action arms clear-image confirmation when image exists without pins", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.ALIGN,
      image: { id: "image" },
      placement: { type: "similarity" },
    },
  };

  const result = transitionMainAction(state, {
    kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
  });

  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM);
  assert.deepEqual(result.effects, [UI_EFFECT_KIND.START_PANEL_TIMEOUT]);
});

test("main action clears image after confirmation and returns to cleared trace session", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      mode: UI_MODE_KIND.ALIGN,
      opacity: 0.2,
      image: { id: "image" },
      placement: { type: "similarity", scale: 2 },
      registration: {
        pins: [],
        solvedTransform: null,
        dirty: false,
      },
    },
    panel: {
      intent: UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM,
    },
  };

  const result = transitionMainAction(state, {
    kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
  });

  assert.deepEqual(result.state.session, createInitialUiState().session);
  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(result.effects, [UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT]);
});

test("panel timeout clears confirmation intent only", () => {
  const state = {
    ...createInitialUiState(),
    panel: {
      intent: UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM,
    },
  };

  const result = transitionMainAction(state, {
    kind: UI_EVENT_KIND.PANEL_TIMEOUT_ELAPSED,
  });

  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(result.effects, []);
});

test("paste cancellation and failure both reset paste arming only", () => {
  const state = {
    ...createInitialUiState(),
    panel: {
      intent: UI_PANEL_INTENT_KIND.PASTE_ARMED,
    },
  };

  const cancelled = transitionMainAction(state, {
    kind: UI_EVENT_KIND.PASTE_CANCELLED,
  });
  assert.equal(cancelled.state.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(cancelled.effects, []);

  const failed = transitionMainAction(state, {
    kind: UI_EVENT_KIND.PASTE_FAILED,
    reason: "clipboard-empty",
  });
  assert.equal(failed.state.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(failed.effects, []);
});
