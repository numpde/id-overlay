import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialPanelActionState,
  isPanelActionSessionActive,
  syncPanelActionState,
} from "../../src/core/panel-state.js";
import { UI_PANEL_INTENT_KIND } from "../../src/core/ui-state-model.js";

test("panel action state has a single initial source of truth", () => {
  assert.deepEqual(createInitialPanelActionState(), {
    kind: UI_PANEL_INTENT_KIND.IDLE,
    sessionId: 0,
  });
});

test("arming and cancelling paste is a single explicit transition path", () => {
  const initial = createInitialPanelActionState();
  const armed = syncPanelActionState(initial, UI_PANEL_INTENT_KIND.PASTE_ARMED);

  assert.deepEqual(armed, {
    kind: UI_PANEL_INTENT_KIND.PASTE_ARMED,
    sessionId: 1,
  });
  assert.equal(isPanelActionSessionActive(armed, 1), true);

  const cancelled = syncPanelActionState(armed, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(cancelled, {
    kind: UI_PANEL_INTENT_KIND.IDLE,
    sessionId: 2,
  });
  assert.equal(isPanelActionSessionActive(cancelled, 1), false);
});

test("clear confirmation and reset preserve the current paste session id", () => {
  const initial = syncPanelActionState(createInitialPanelActionState(), UI_PANEL_INTENT_KIND.PASTE_ARMED);
  const idle = syncPanelActionState(initial, UI_PANEL_INTENT_KIND.IDLE);
  const confirming = syncPanelActionState(idle, UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM);

  assert.deepEqual(confirming, {
    kind: UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM,
    sessionId: idle.sessionId,
  });

  const imageConfirming = syncPanelActionState(idle, UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM);
  assert.deepEqual(imageConfirming, {
    kind: UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM,
    sessionId: idle.sessionId,
  });

  const reset = syncPanelActionState(confirming, UI_PANEL_INTENT_KIND.IDLE);
  assert.deepEqual(reset, {
    kind: UI_PANEL_INTENT_KIND.IDLE,
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
  assert.equal(syncPanelActionState(initial, UI_PANEL_INTENT_KIND.IDLE), initial);

  const confirming = syncPanelActionState(initial, UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM);
  assert.equal(
    syncPanelActionState(confirming, UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM),
    confirming,
  );
});
