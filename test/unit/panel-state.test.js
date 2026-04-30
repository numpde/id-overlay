import test from "node:test";
import assert from "node:assert/strict";

import {
  PANEL_ACTION_EVENT,
  PANEL_ACTION_KIND,
  createInitialPanelActionState,
  hasActivePanelAction,
  isClearImageConfirming,
  isClearConfirming,
  isClearPinsConfirming,
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
  const confirming = reducePanelActionState(idle, PANEL_ACTION_EVENT.ARM_CLEAR_PINS_CONFIRM);

  assert.deepEqual(confirming, {
    kind: PANEL_ACTION_KIND.CLEAR_PINS_CONFIRM,
    sessionId: idle.sessionId,
  });
  assert.equal(isClearConfirming(confirming), true);
  assert.equal(isClearPinsConfirming(confirming), true);
  assert.equal(isClearImageConfirming(confirming), false);

  const imageConfirming = reducePanelActionState(idle, PANEL_ACTION_EVENT.ARM_CLEAR_IMAGE_CONFIRM);
  assert.deepEqual(imageConfirming, {
    kind: PANEL_ACTION_KIND.CLEAR_IMAGE_CONFIRM,
    sessionId: idle.sessionId,
  });
  assert.equal(isClearConfirming(imageConfirming), true);
  assert.equal(isClearPinsConfirming(imageConfirming), false);
  assert.equal(isClearImageConfirming(imageConfirming), true);

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
      canPasteImage: false,
      clearConfirmationTimeoutMs: 1800,
    }),
    {
      hasImage: true,
      canPasteImage: false,
      pinCount: 0,
      isIdle: true,
      hasActiveAction: false,
      pasteArmed: false,
      clearPinsConfirming: false,
      clearImageConfirming: false,
      clearConfirming: false,
      canClearPins: false,
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
      canPasteImage: true,
      pinCount: 2,
      clearConfirmationTimeoutMs: 1800,
    }),
    {
      hasImage: true,
      canPasteImage: true,
      pinCount: 2,
      isIdle: false,
      hasActiveAction: true,
      pasteArmed: true,
      clearPinsConfirming: false,
      clearImageConfirming: false,
      clearConfirming: false,
      canClearPins: true,
      shouldReset: false,
      shouldAttachPasteListener: true,
      autoResetTimeoutMs: null,
    },
  );

  const clearPinsConfirmState = reducePanelActionState(
    createInitialPanelActionState(),
    PANEL_ACTION_EVENT.ARM_CLEAR_PINS_CONFIRM,
  );
  assert.deepEqual(
    resolvePanelActionSemantics(clearPinsConfirmState, {
      canPasteImage: true,
      pinCount: 2,
      clearConfirmationTimeoutMs: 1800,
    }),
    {
      hasImage: true,
      canPasteImage: true,
      pinCount: 2,
      isIdle: false,
      hasActiveAction: true,
      pasteArmed: false,
      clearPinsConfirming: true,
      clearImageConfirming: false,
      clearConfirming: true,
      canClearPins: true,
      shouldReset: false,
      shouldAttachPasteListener: false,
      autoResetTimeoutMs: 1800,
    },
  );

  const clearImageConfirmState = reducePanelActionState(
    createInitialPanelActionState(),
    PANEL_ACTION_EVENT.ARM_CLEAR_IMAGE_CONFIRM,
  );
  assert.deepEqual(
    resolvePanelActionSemantics(clearImageConfirmState, {
      canPasteImage: true,
      pinCount: 0,
      clearConfirmationTimeoutMs: 1800,
    }),
    {
      hasImage: true,
      canPasteImage: true,
      pinCount: 0,
      isIdle: false,
      hasActiveAction: true,
      pasteArmed: false,
      clearPinsConfirming: false,
      clearImageConfirming: true,
      clearConfirming: true,
      canClearPins: false,
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
      canPasteImage: true,
      pinCount: 0,
      clearConfirmationTimeoutMs: 1800,
    }).shouldReset,
    true,
  );

  const clearPinsConfirmState = reducePanelActionState(
    createInitialPanelActionState(),
    PANEL_ACTION_EVENT.ARM_CLEAR_PINS_CONFIRM,
  );
  assert.equal(
    resolvePanelActionSemantics(clearPinsConfirmState, {
      hasImage: true,
      canPasteImage: true,
      pinCount: 0,
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
