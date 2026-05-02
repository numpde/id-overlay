import test from "node:test";
import assert from "node:assert/strict";

import {
  getUiEventTransitionKind,
  UI_EVENT_FAMILY_KIND,
  UI_EVENT_KIND,
  UI_EVENT_MODEL,
  UI_EVENT_TRANSITION_KIND,
} from "../../src/core/ui-event-model.js";

test("ui event family vocabulary matches the intended semantic layers", () => {
  assert.deepEqual(UI_EVENT_FAMILY_KIND, {
    INTENT: "intent",
    OUTCOME: "outcome",
    SYSTEM: "system",
  });
});

test("ui event transition vocabulary matches reducer ownership boundaries", () => {
  assert.deepEqual(UI_EVENT_TRANSITION_KIND, {
    MAIN_ACTION: "main-action",
    MODE: "mode",
    REGISTRATION: "registration",
    HISTORY: "history",
  });
});

test("ui event kind vocabulary is semantic and compact", () => {
  assert.deepEqual(UI_EVENT_KIND, {
    MAIN_ACTION_TRIGGERED: "main-action-triggered",
    MODE_SELECTED: "mode-selected",
    CLEAR_PINS_TRIGGERED: "clear-pins-triggered",
    UNDO_TRIGGERED: "undo-triggered",
    REDO_TRIGGERED: "redo-triggered",
    PASTE_SUCCEEDED: "paste-succeeded",
    PASTE_CANCELLED: "paste-cancelled",
    PASTE_FAILED: "paste-failed",
    SOLVE_SUCCEEDED: "solve-succeeded",
    SOLVE_FAILED: "solve-failed",
    PANEL_TIMEOUT_ELAPSED: "panel-timeout-elapsed",
  });
});

test("ui event model exposes family and payload-key shapes", () => {
  assert.deepEqual(UI_EVENT_MODEL.MAIN_ACTION_TRIGGERED, {
    kind: UI_EVENT_KIND.MAIN_ACTION_TRIGGERED,
    family: UI_EVENT_FAMILY_KIND.INTENT,
    transitionKind: UI_EVENT_TRANSITION_KIND.MAIN_ACTION,
    payloadKeys: [],
  });

  assert.deepEqual(UI_EVENT_MODEL.PASTE_SUCCEEDED, {
    kind: UI_EVENT_KIND.PASTE_SUCCEEDED,
    family: UI_EVENT_FAMILY_KIND.OUTCOME,
    transitionKind: UI_EVENT_TRANSITION_KIND.MAIN_ACTION,
    payloadKeys: ["image", "placement"],
  });

  assert.deepEqual(UI_EVENT_MODEL.CLEAR_PINS_TRIGGERED, {
    kind: UI_EVENT_KIND.CLEAR_PINS_TRIGGERED,
    family: UI_EVENT_FAMILY_KIND.INTENT,
    transitionKind: UI_EVENT_TRANSITION_KIND.REGISTRATION,
    payloadKeys: [],
  });

  assert.deepEqual(UI_EVENT_MODEL.UNDO_TRIGGERED, {
    kind: UI_EVENT_KIND.UNDO_TRIGGERED,
    family: UI_EVENT_FAMILY_KIND.INTENT,
    transitionKind: UI_EVENT_TRANSITION_KIND.HISTORY,
    payloadKeys: [],
  });

  assert.deepEqual(UI_EVENT_MODEL.PANEL_TIMEOUT_ELAPSED, {
    kind: UI_EVENT_KIND.PANEL_TIMEOUT_ELAPSED,
    family: UI_EVENT_FAMILY_KIND.SYSTEM,
    transitionKind: UI_EVENT_TRANSITION_KIND.MAIN_ACTION,
    payloadKeys: [],
  });
});

test("ui event model exposes transition ownership by event kind", () => {
  assert.equal(
    getUiEventTransitionKind(UI_EVENT_KIND.MAIN_ACTION_TRIGGERED),
    UI_EVENT_TRANSITION_KIND.MAIN_ACTION,
  );
  assert.equal(
    getUiEventTransitionKind(UI_EVENT_KIND.MODE_SELECTED),
    UI_EVENT_TRANSITION_KIND.MODE,
  );
  assert.equal(
    getUiEventTransitionKind(UI_EVENT_KIND.CLEAR_PINS_TRIGGERED),
    UI_EVENT_TRANSITION_KIND.REGISTRATION,
  );
  assert.equal(
    getUiEventTransitionKind(UI_EVENT_KIND.UNDO_TRIGGERED),
    UI_EVENT_TRANSITION_KIND.HISTORY,
  );
  assert.equal(getUiEventTransitionKind("unsupported"), null);
});
