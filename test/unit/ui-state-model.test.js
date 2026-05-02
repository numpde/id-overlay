import test from "node:test";
import assert from "node:assert/strict";

import {
  UI_ACTIVE_GESTURE_KIND,
  createInitialUiState,
  UI_INPUT_OVERRIDE_KIND,
  UI_MODE_KIND,
  UI_PANEL_INTENT_KIND,
} from "../../src/core/ui-state-model.js";

test("ui state model exposes the intended initial shape", () => {
  // Final semantic-history shape: when semantic history records move into
  // canonical UI state, this shape test should change first. Avoid threading
  // history around as ad hoc view-model input instead.
  assert.deepEqual(createInitialUiState(), {
    session: {
      mode: UI_MODE_KIND.TRACE,
      opacity: 0.6,
      image: null,
      placement: null,
      registration: {
        pins: [],
        solvedTransform: null,
        dirty: false,
      },
    },
    runtime: {
      pointer: {
        screenPx: null,
      },
      activeGesture: null,
      inputOverride: null,
    },
    panel: {
      intent: UI_PANEL_INTENT_KIND.IDLE,
    },
  });
});

test("gesture vocabulary matches the intended runtime structure", () => {
  assert.deepEqual(UI_ACTIVE_GESTURE_KIND, {
    MAP_PAN: "map-pan",
    MOVE_OVERLAY: "move-overlay",
  });
});

test("runtime override and panel intent vocabularies match the current state shape", () => {
  assert.deepEqual(UI_INPUT_OVERRIDE_KIND, {
    PASS_THROUGH: "pass-through",
  });
  assert.deepEqual(UI_PANEL_INTENT_KIND, {
    IDLE: "idle",
    PASTE_ARMED: "paste-armed",
    CLEAR_PINS_CONFIRM: "clear-pins-confirm",
    CLEAR_IMAGE_CONFIRM: "clear-image-confirm",
  });
});
