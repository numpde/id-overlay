import test from "node:test";
import assert from "node:assert/strict";

import {
  PANEL_ACTION_KIND,
  createInitialPanelActionState,
  isPanelActionSessionActive,
  syncPanelActionState,
} from "../../src/core/panel-state.js";

test("panel action state has a single initial source of truth", () => {
  assert.deepEqual(createInitialPanelActionState(), {
    kind: PANEL_ACTION_KIND.IDLE,
    sessionId: 0,
  });
});

test("arming and cancelling paste is a single explicit transition path", () => {
  const initial = createInitialPanelActionState();
  const armed = syncPanelActionState(initial, PANEL_ACTION_KIND.PASTE_ARMED);

  assert.deepEqual(armed, {
    kind: PANEL_ACTION_KIND.PASTE_ARMED,
    sessionId: 1,
  });
  assert.equal(isPanelActionSessionActive(armed, 1), true);

  const cancelled = syncPanelActionState(armed, PANEL_ACTION_KIND.IDLE);
  assert.deepEqual(cancelled, {
    kind: PANEL_ACTION_KIND.IDLE,
    sessionId: 2,
  });
  assert.equal(isPanelActionSessionActive(cancelled, 1), false);
});

test("clear confirmation and reset preserve the current paste session id", () => {
  const initial = syncPanelActionState(createInitialPanelActionState(), PANEL_ACTION_KIND.PASTE_ARMED);
  const idle = syncPanelActionState(initial, PANEL_ACTION_KIND.IDLE);
  const confirming = syncPanelActionState(idle, PANEL_ACTION_KIND.CLEAR_PINS_CONFIRM);

  assert.deepEqual(confirming, {
    kind: PANEL_ACTION_KIND.CLEAR_PINS_CONFIRM,
    sessionId: idle.sessionId,
  });

  const imageConfirming = syncPanelActionState(idle, PANEL_ACTION_KIND.CLEAR_IMAGE_CONFIRM);
  assert.deepEqual(imageConfirming, {
    kind: PANEL_ACTION_KIND.CLEAR_IMAGE_CONFIRM,
    sessionId: idle.sessionId,
  });

  const reset = syncPanelActionState(confirming, PANEL_ACTION_KIND.IDLE);
  assert.deepEqual(reset, {
    kind: PANEL_ACTION_KIND.IDLE,
    sessionId: idle.sessionId,
  });
});

test("unknown panel action kinds are a no-op", () => {
  const initial = createInitialPanelActionState();
  assert.equal(
    syncPanelActionState(initial, "unknown-kind"),
    initial,
  );
});

test("panel action reducer preserves object identity for semantic no-op transitions", () => {
  const initial = createInitialPanelActionState();
  assert.equal(syncPanelActionState(initial, PANEL_ACTION_KIND.IDLE), initial);

  const confirming = syncPanelActionState(initial, PANEL_ACTION_KIND.CLEAR_PINS_CONFIRM);
  assert.equal(
    syncPanelActionState(confirming, PANEL_ACTION_KIND.CLEAR_PINS_CONFIRM),
    confirming,
  );
});
