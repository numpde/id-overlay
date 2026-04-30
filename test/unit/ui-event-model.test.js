import test from "node:test";
import assert from "node:assert/strict";

import {
  UI_EVENT_FAMILY_KIND,
  UI_EVENT_KIND,
  UI_EVENT_MODEL,
} from "../../src/core/ui-event-model.js";

test("ui event family vocabulary matches the intended semantic layers", () => {
  assert.deepEqual(UI_EVENT_FAMILY_KIND, {
    INTENT: "intent",
    OUTCOME: "outcome",
    SYSTEM: "system",
  });
});

test("ui event kind vocabulary is semantic and compact", () => {
  assert.deepEqual(UI_EVENT_KIND, {
    MAIN_ACTION_TRIGGERED: "main-action-triggered",
    MODE_SELECTED: "mode-selected",
    OPACITY_SET: "opacity-set",
    PIN_ADDED: "pin-added",
    PIN_REMOVED: "pin-removed",
    CLEAR_PINS_TRIGGERED: "clear-pins-triggered",
    PASTE_SUCCEEDED: "paste-succeeded",
    PASTE_CANCELLED: "paste-cancelled",
    PASTE_FAILED: "paste-failed",
    SOLVE_SUCCEEDED: "solve-succeeded",
    SOLVE_FAILED: "solve-failed",
    SESSION_RESTORED: "session-restored",
    PANEL_TIMEOUT_ELAPSED: "panel-timeout-elapsed",
  });
});

test("ui event model exposes family and payload-key shapes", () => {
  assert.deepEqual(UI_EVENT_MODEL.MAIN_ACTION_TRIGGERED, {
    kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
    family: UI_EVENT_FAMILY_KIND.INTENT,
    payloadKeys: [],
  });

  assert.deepEqual(UI_EVENT_MODEL.PASTE_SUCCEEDED, {
    kind: UI_EVENT_KIND.PASTE_SUCCEEDED,
    family: UI_EVENT_FAMILY_KIND.OUTCOME,
    payloadKeys: ["image", "placement"],
  });

  assert.deepEqual(UI_EVENT_MODEL.PIN_ADDED, {
    kind: UI_EVENT_KIND.PIN_ADDED,
    family: UI_EVENT_FAMILY_KIND.INTENT,
    payloadKeys: ["pin"],
  });

  assert.deepEqual(UI_EVENT_MODEL.CLEAR_PINS_TRIGGERED, {
    kind: UI_EVENT_KIND.CLEAR_PINS_TRIGGERED,
    family: UI_EVENT_FAMILY_KIND.INTENT,
    payloadKeys: [],
  });

  assert.deepEqual(UI_EVENT_MODEL.PANEL_TIMEOUT_ELAPSED, {
    kind: UI_EVENT_KIND.PANEL_TIMEOUT_ELAPSED,
    family: UI_EVENT_FAMILY_KIND.SYSTEM,
    payloadKeys: [],
  });
});
