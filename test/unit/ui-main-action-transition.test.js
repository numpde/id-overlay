import test from "node:test";
import assert from "node:assert/strict";

import { UI_EFFECT_KIND } from "../../src/core/ui-effect-model.js";
import { UI_EVENT_KIND } from "../../src/core/ui-event-model.js";
import {
  resolveMainActionDescriptor,
  transitionMainAction,
} from "../../src/core/ui-main-action-transition.js";
import {
  createInitialUiState,
  UI_MODE_KIND,
  UI_PANEL_INTENT_KIND,
} from "../../src/core/ui-state-model.js";
import { deepFreeze } from "../helpers/deep-freeze.js";

test("main action descriptor target is derived from actionable registration affordances", () => {
  const empty = createInitialUiState();
  assert.equal(resolveMainActionDescriptor(empty).target, "paste");

  const imageOnly = {
    ...empty,
    session: {
      ...empty.session,
      image: { id: "image" },
      mode: UI_MODE_KIND.ALIGN,
    },
  };
  assert.equal(resolveMainActionDescriptor(imageOnly).target, "clear-image");

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
  assert.equal(resolveMainActionDescriptor(withPins).target, "clear-pins");

  const traceWithPins = {
    ...withPins,
    session: {
      ...withPins.session,
      mode: UI_MODE_KIND.TRACE,
    },
  };
  assert.equal(resolveMainActionDescriptor(traceWithPins).target, "clear-image");
});

test("main action descriptor captures the local semantic distinctions", () => {
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

  assert.deepEqual(resolveMainActionDescriptor(state), {
    hasImage: true,
    pinCount: 0,
    intent: UI_PANEL_INTENT_KIND.IDLE,
    target: "clear-image",
    canPasteImage: true,
    canClearPins: false,
    shouldReset: false,
    disabled: false,
    label: "Clear image",
    presentationKind: "neutral",
    nextIntent: UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM,
    pasteArmed: false,
    clearConfirming: false,
  });
});

test("main action arms paste from empty trace when no image is present", () => {
  const state = createInitialUiState();
  const result = transitionMainAction(state, {
    kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
  });

  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.PASTE_ARMED);
  assert.deepEqual(result.effects, [UI_EFFECT_KIND.REQUEST_PASTE_INPUT]);
});

test("main action also arms paste from empty align and requests paste input", () => {
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
  assert.deepEqual(result.effects, [
    UI_EFFECT_KIND.SHOW_PASTE_CANCELLED_FEEDBACK,
  ]);
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
  assert.deepEqual(result.effects, [
    UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    UI_EFFECT_KIND.CLEAR_PINS,
  ]);
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

test("clear-pins confirmation in trace mode resets back to idle when pins are hidden", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.TRACE,
      image: { id: "image" },
      registration: {
        pins: [{ id: 1 }],
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

test("stale clear-image confirmation resets back to idle instead of clearing pins or image", () => {
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
    panel: {
      intent: UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM,
    },
  };

  const result = transitionMainAction(state, {
    kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
  });

  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(result.state.session.registration.pins, [{ id: 1 }]);
  assert.deepEqual(result.effects, []);
});

test("stale paste intent resets back to idle when an image appears", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.ALIGN,
      image: { id: "image" },
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
  assert.deepEqual(result.effects, [
    UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    UI_EFFECT_KIND.CLEAR_IMAGE,
  ]);
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

test("panel timeout is a pure no-op while idle", () => {
  const state = createInitialUiState();
  const result = transitionMainAction(state, {
    kind: UI_EVENT_KIND.PANEL_TIMEOUT_ELAPSED,
  });

  assert.equal(result.state, state);
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

test("main-action transitions do not mutate frozen input state or event payloads", () => {
  const state = deepFreeze({
    ...createInitialUiState(),
    session: {
      ...createInitialUiState().session,
      mode: UI_MODE_KIND.ALIGN,
    },
  });
  const event = deepFreeze({
    kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
  });

  const result = transitionMainAction(state, event);

  assert.equal(state.panel.intent, UI_PANEL_INTENT_KIND.IDLE);
  assert.equal(result.state.panel.intent, UI_PANEL_INTENT_KIND.PASTE_ARMED);
  assert.deepEqual(result.effects, [UI_EFFECT_KIND.REQUEST_PASTE_INPUT]);
  assert.equal(Object.isFrozen(result.effects), true);
});
