import test from "node:test";
import assert from "node:assert/strict";

import {
  PANEL_ACTION_EVENT,
  PANEL_ACTION_KIND,
  createInitialPanelActionState,
  hasActivePanelAction,
  isClearConfirming,
  isPanelActionIdle,
  isPanelActionSessionActive,
  isPasteArmed,
  reducePanelActionState,
  resolvePanelActionSemantics,
} from "../../src/core/panel-state.js";

test("panel action state has a single initial source of truth", () => {
  assert.deepEqual(createInitialPanelActionState(), {
    kind: PANEL_ACTION_KIND.IDLE,
    sessionId: 0,
  });
  assert.equal(isPanelActionIdle(createInitialPanelActionState()), true);
  assert.equal(hasActivePanelAction(createInitialPanelActionState()), false);
});

test("arming and cancelling paste is a single explicit transition path", () => {
  const initial = createInitialPanelActionState();
  const armed = reducePanelActionState(initial, PANEL_ACTION_EVENT.ARM_PASTE);

  assert.deepEqual(armed, {
    kind: PANEL_ACTION_KIND.PASTE_ARMED,
    sessionId: 1,
  });
  assert.equal(isPasteArmed(armed), true);
  assert.equal(isPanelActionSessionActive(armed, 1), true);

  const cancelled = reducePanelActionState(armed, PANEL_ACTION_EVENT.CANCEL_PASTE);
  assert.deepEqual(cancelled, {
    kind: PANEL_ACTION_KIND.IDLE,
    sessionId: 2,
  });
  assert.equal(isPasteArmed(cancelled), false);
  assert.equal(isPanelActionSessionActive(cancelled, 1), false);
});

test("clear confirmation and reset preserve the current paste session id", () => {
  const initial = reducePanelActionState(createInitialPanelActionState(), PANEL_ACTION_EVENT.ARM_PASTE);
  const idle = reducePanelActionState(initial, PANEL_ACTION_EVENT.CANCEL_PASTE);
  const confirming = reducePanelActionState(idle, PANEL_ACTION_EVENT.ARM_CLEAR_CONFIRM);

  assert.deepEqual(confirming, {
    kind: PANEL_ACTION_KIND.CLEAR_CONFIRM,
    sessionId: idle.sessionId,
  });
  assert.equal(isClearConfirming(confirming), true);

  const reset = reducePanelActionState(confirming, PANEL_ACTION_EVENT.RESET);
  assert.deepEqual(reset, {
    kind: PANEL_ACTION_KIND.IDLE,
    sessionId: idle.sessionId,
  });
  assert.equal(isClearConfirming(reset), false);
});

test("panel action semantics are single-source for active state, paste capture, and auto-reset timing", () => {
  assert.deepEqual(
    resolvePanelActionSemantics(createInitialPanelActionState(), {
      clearConfirmationTimeoutMs: 1800,
    }),
    {
      isIdle: true,
      hasActiveAction: false,
      pasteArmed: false,
      clearConfirming: false,
      shouldReset: false,
      shouldAttachPasteListener: false,
      autoResetTimeoutMs: null,
    },
  );

  const pasteArmedState = reducePanelActionState(
    createInitialPanelActionState(),
    PANEL_ACTION_EVENT.ARM_PASTE,
  );
  assert.deepEqual(
    resolvePanelActionSemantics(pasteArmedState, {
      clearConfirmationTimeoutMs: 1800,
    }),
    {
      isIdle: false,
      hasActiveAction: true,
      pasteArmed: true,
      clearConfirming: false,
      shouldReset: false,
      shouldAttachPasteListener: true,
      autoResetTimeoutMs: null,
    },
  );

  const clearConfirmState = reducePanelActionState(
    createInitialPanelActionState(),
    PANEL_ACTION_EVENT.ARM_CLEAR_CONFIRM,
  );
  assert.deepEqual(
    resolvePanelActionSemantics(clearConfirmState, {
      clearConfirmationTimeoutMs: 1800,
    }),
    {
      isIdle: false,
      hasActiveAction: true,
      pasteArmed: false,
      clearConfirming: true,
      shouldReset: false,
      shouldAttachPasteListener: false,
      autoResetTimeoutMs: 1800,
    },
  );
});

test("panel action semantics own reset-on-missing-image behavior", () => {
  const pasteArmedState = reducePanelActionState(
    createInitialPanelActionState(),
    PANEL_ACTION_EVENT.ARM_PASTE,
  );

  assert.equal(
    resolvePanelActionSemantics(pasteArmedState, {
      hasImage: false,
      clearConfirmationTimeoutMs: 1800,
    }).shouldReset,
    true,
  );
});

test("unknown panel action events are a no-op", () => {
  const initial = createInitialPanelActionState();
  assert.equal(
    reducePanelActionState(initial, "unknown-event"),
    initial,
  );
});
