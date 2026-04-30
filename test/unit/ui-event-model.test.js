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
    RUNTIME: "runtime",
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
    PASTE_SUCCEEDED: "paste-succeeded",
    PASTE_CANCELLED: "paste-cancelled",
    PASTE_FAILED: "paste-failed",
    SOLVE_SUCCEEDED: "solve-succeeded",
    SOLVE_FAILED: "solve-failed",
    SESSION_RESTORED: "session-restored",
    POINTER_MOVED: "pointer-moved",
    ACTIVE_GESTURE_CHANGED: "active-gesture-changed",
    INPUT_OVERRIDE_CHANGED: "input-override-changed",
    PANEL_TIMEOUT_ELAPSED: "panel-timeout-elapsed",
    STATUS_MESSAGE_OVERRIDE_SET: "status-message-override-set",
    STATUS_MESSAGE_OVERRIDE_CLEARED: "status-message-override-cleared",
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

  assert.deepEqual(UI_EVENT_MODEL.ACTIVE_GESTURE_CHANGED, {
    kind: UI_EVENT_KIND.ACTIVE_GESTURE_CHANGED,
    family: UI_EVENT_FAMILY_KIND.RUNTIME,
    payloadKeys: ["activeGesture"],
  });

  assert.deepEqual(UI_EVENT_MODEL.STATUS_MESSAGE_OVERRIDE_SET, {
    kind: UI_EVENT_KIND.STATUS_MESSAGE_OVERRIDE_SET,
    family: UI_EVENT_FAMILY_KIND.SYSTEM,
    payloadKeys: ["message"],
  });
});
