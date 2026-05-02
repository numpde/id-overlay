import test from "node:test";
import assert from "node:assert/strict";

import {
  UI_EFFECT_KIND,
  UI_EFFECT_MODEL,
} from "../../src/core/ui-effect-model.js";

test("ui effect vocabulary stays minimal and semantic", () => {
  // Final semantic-history shape: REQUEST_REGISTRATION_SOLVE, CLEAR_PINS,
  // CLEAR_IMAGE, UNDO_SESSION, and REDO_SESSION should be reconsidered here.
  // Durable state changes should be reducer-owned transitions, not effects.
  assert.deepEqual(UI_EFFECT_KIND, {
    REQUEST_PASTE_INPUT: "request-paste-input",
    REQUEST_REGISTRATION_SOLVE: "request-registration-solve",
    CLEAR_PINS: "clear-pins",
    CLEAR_IMAGE: "clear-image",
    UNDO_SESSION: "undo-session",
    REDO_SESSION: "redo-session",
    SHOW_PASTE_CANCELLED_FEEDBACK: "show-paste-cancelled-feedback",
    START_PANEL_TIMEOUT: "start-panel-timeout",
    CANCEL_PANEL_TIMEOUT: "cancel-panel-timeout",
  });
});

test("ui effect model exposes effect definitions", () => {
  // Final semantic-history shape: delete assertions for effects that disappear
  // when history and fit-overlay move fully into the state machine.
  assert.deepEqual(UI_EFFECT_MODEL.REQUEST_PASTE_INPUT, {
    kind: UI_EFFECT_KIND.REQUEST_PASTE_INPUT,
  });
  assert.deepEqual(UI_EFFECT_MODEL.REQUEST_REGISTRATION_SOLVE, {
    kind: UI_EFFECT_KIND.REQUEST_REGISTRATION_SOLVE,
  });
  assert.deepEqual(UI_EFFECT_MODEL.CLEAR_PINS, {
    kind: UI_EFFECT_KIND.CLEAR_PINS,
  });
  assert.deepEqual(UI_EFFECT_MODEL.CLEAR_IMAGE, {
    kind: UI_EFFECT_KIND.CLEAR_IMAGE,
  });
  assert.deepEqual(UI_EFFECT_MODEL.UNDO_SESSION, {
    kind: UI_EFFECT_KIND.UNDO_SESSION,
  });
  assert.deepEqual(UI_EFFECT_MODEL.REDO_SESSION, {
    kind: UI_EFFECT_KIND.REDO_SESSION,
  });
  assert.deepEqual(UI_EFFECT_MODEL.SHOW_PASTE_CANCELLED_FEEDBACK, {
    kind: UI_EFFECT_KIND.SHOW_PASTE_CANCELLED_FEEDBACK,
  });
  assert.deepEqual(UI_EFFECT_MODEL.START_PANEL_TIMEOUT, {
    kind: UI_EFFECT_KIND.START_PANEL_TIMEOUT,
  });
  assert.deepEqual(UI_EFFECT_MODEL.CANCEL_PANEL_TIMEOUT, {
    kind: UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
  });
});
