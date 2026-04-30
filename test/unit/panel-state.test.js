import test from "node:test";
import assert from "node:assert/strict";

import {
  PANEL_ACTION_EVENT,
  PANEL_ACTION_KIND,
  createInitialPanelActionState,
  isPanelActionSessionActive,
  reducePanelActionState,
} from "../../src/core/panel-state.js";

test("panel action state has a single initial source of truth", () => {
  assert.deepEqual(createInitialPanelActionState(), {
    kind: PANEL_ACTION_KIND.IDLE,
    sessionId: 0,
  });
});

test("arming and cancelling paste is a single explicit transition path", () => {
  const initial = createInitialPanelActionState();
  const armed = reducePanelActionState(initial, PANEL_ACTION_EVENT.ARM_PASTE);

  assert.deepEqual(armed, {
    kind: PANEL_ACTION_KIND.PASTE_ARMED,
    sessionId: 1,
  });
  assert.equal(isPanelActionSessionActive(armed, 1), true);

  const cancelled = reducePanelActionState(armed, PANEL_ACTION_EVENT.CANCEL_PASTE);
  assert.deepEqual(cancelled, {
    kind: PANEL_ACTION_KIND.IDLE,
    sessionId: 2,
  });
  assert.equal(isPanelActionSessionActive(cancelled, 1), false);
});

test("clear confirmation and reset preserve the current paste session id", () => {
  const initial = reducePanelActionState(createInitialPanelActionState(), PANEL_ACTION_EVENT.ARM_PASTE);
  const idle = reducePanelActionState(initial, PANEL_ACTION_EVENT.CANCEL_PASTE);
  const confirming = reducePanelActionState(idle, PANEL_ACTION_EVENT.ARM_CLEAR_PINS_CONFIRM);

  assert.deepEqual(confirming, {
    kind: PANEL_ACTION_KIND.CLEAR_PINS_CONFIRM,
    sessionId: idle.sessionId,
  });

  const imageConfirming = reducePanelActionState(idle, PANEL_ACTION_EVENT.ARM_CLEAR_IMAGE_CONFIRM);
  assert.deepEqual(imageConfirming, {
    kind: PANEL_ACTION_KIND.CLEAR_IMAGE_CONFIRM,
    sessionId: idle.sessionId,
  });

  const reset = reducePanelActionState(confirming, PANEL_ACTION_EVENT.RESET);
  assert.deepEqual(reset, {
    kind: PANEL_ACTION_KIND.IDLE,
    sessionId: idle.sessionId,
  });
});

test("unknown panel action events are a no-op", () => {
  const initial = createInitialPanelActionState();
  assert.equal(
    reducePanelActionState(initial, "unknown-event"),
    initial,
  );
});

test("panel action reducer preserves object identity for semantic no-op transitions", () => {
  const initial = createInitialPanelActionState();
  assert.equal(reducePanelActionState(initial, PANEL_ACTION_EVENT.RESET), initial);
  assert.equal(reducePanelActionState(initial, PANEL_ACTION_EVENT.CANCEL_PASTE), initial);

  const confirming = reducePanelActionState(initial, PANEL_ACTION_EVENT.ARM_CLEAR_PINS_CONFIRM);
  assert.equal(
    reducePanelActionState(confirming, PANEL_ACTION_EVENT.ARM_CLEAR_PINS_CONFIRM),
    confirming,
  );
});
