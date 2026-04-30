import test from "node:test";
import assert from "node:assert/strict";

import { UI_EFFECT_KIND } from "../../src/core/ui-effect-model.js";
import { UI_EVENT_KIND } from "../../src/core/ui-event-model.js";
import { transitionRegistration } from "../../src/core/ui-registration-transition.js";
import {
  createInitialUiState,
  UI_MODE_KIND,
  UI_PANEL_INTENT_KIND,
} from "../../src/core/ui-state-model.js";
import { deepFreeze } from "../helpers/deep-freeze.js";

test("clear-pins trigger clears registration and resets panel intent when available", () => {
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
      intent: UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM,
    },
  };

  const result = transitionRegistration(state, {
    kind: UI_EVENT_KIND.CLEAR_PINS_TRIGGERED,
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

test("clear-pins trigger is a no-op when registration clearing is not available", () => {
  const emptyTrace = createInitialUiState();
  assert.equal(
    transitionRegistration(emptyTrace, {
      kind: UI_EVENT_KIND.CLEAR_PINS_TRIGGERED,
    }).state,
    emptyTrace,
  );

  const imageTrace = {
    ...emptyTrace,
    session: {
      ...emptyTrace.session,
      image: { id: "image" },
      registration: {
        pins: [{ id: 1 }],
        solvedTransform: null,
        dirty: true,
      },
    },
  };
  assert.equal(
    transitionRegistration(imageTrace, {
      kind: UI_EVENT_KIND.CLEAR_PINS_TRIGGERED,
    }).state,
    imageTrace,
  );
});

test("registration transition does not mutate frozen input state", () => {
  const base = createInitialUiState();
  const state = deepFreeze({
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
  });
  const event = deepFreeze({
    kind: UI_EVENT_KIND.CLEAR_PINS_TRIGGERED,
  });

  const result = transitionRegistration(state, event);
  assert.notEqual(result.state, state);
  assert.deepEqual(state.session.registration.pins, [{ id: 1 }]);
});
