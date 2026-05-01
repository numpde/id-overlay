import test from "node:test";
import assert from "node:assert/strict";

import {
  UI_EFFECT_KIND,
  UI_EFFECT_MODEL,
} from "../../src/core/ui-effect-model.js";

test("ui effect vocabulary stays minimal and semantic", () => {
  assert.deepEqual(UI_EFFECT_KIND, {
    REQUEST_PASTE_INPUT: "request-paste-input",
    REQUEST_REGISTRATION_SOLVE: "request-registration-solve",
    CLEAR_PINS: "clear-pins",
    CLEAR_IMAGE: "clear-image",
    SHOW_PASTE_CANCELLED_FEEDBACK: "show-paste-cancelled-feedback",
    START_PANEL_TIMEOUT: "start-panel-timeout",
    CANCEL_PANEL_TIMEOUT: "cancel-panel-timeout",
  });
});

test("ui effect model exposes payload-key shapes", () => {
  assert.deepEqual(UI_EFFECT_MODEL.REQUEST_PASTE_INPUT, {
    kind: UI_EFFECT_KIND.REQUEST_PASTE_INPUT,
    payloadKeys: [],
  });
  assert.deepEqual(UI_EFFECT_MODEL.REQUEST_REGISTRATION_SOLVE, {
    kind: UI_EFFECT_KIND.REQUEST_REGISTRATION_SOLVE,
    payloadKeys: [],
  });
  assert.deepEqual(UI_EFFECT_MODEL.CLEAR_PINS, {
    kind: UI_EFFECT_KIND.CLEAR_PINS,
    payloadKeys: [],
  });
  assert.deepEqual(UI_EFFECT_MODEL.CLEAR_IMAGE, {
    kind: UI_EFFECT_KIND.CLEAR_IMAGE,
    payloadKeys: [],
  });
  assert.deepEqual(UI_EFFECT_MODEL.SHOW_PASTE_CANCELLED_FEEDBACK, {
    kind: UI_EFFECT_KIND.SHOW_PASTE_CANCELLED_FEEDBACK,
    payloadKeys: [],
  });
  assert.deepEqual(UI_EFFECT_MODEL.START_PANEL_TIMEOUT, {
    kind: UI_EFFECT_KIND.START_PANEL_TIMEOUT,
    payloadKeys: [],
  });
  assert.deepEqual(UI_EFFECT_MODEL.CANCEL_PANEL_TIMEOUT, {
    kind: UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    payloadKeys: [],
  });
});
