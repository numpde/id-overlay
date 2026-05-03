import test from "node:test";
import assert from "node:assert/strict";

import { createStatusController } from "../../src/content/status-controller.js";
import { INTERACTION_EVENT } from "../../src/core/interaction-policy.js";
import {
  PANEL_FEEDBACK_ACTION,
  describeInteractionEventPresentation,
  describePinResultPresentation,
  describeSolveResultPresentation,
} from "../../src/core/presentation.js";
import {
  MACHINE_EVENT_KIND,
  MACHINE_FEEDBACK_KIND,
  MACHINE_PANEL_INTENT,
  createMachineHost,
} from "../../src/core/machine/index.js";

test("status controller falls back to derived status after a transient", async () => {
  const machineHost = createMachineHost();
  const eventListeners = new Set();
  const interactions = {
    subscribeEvents(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
  };

  const controller = createStatusController({ machineHost, interactions });
  const messages = [];
  const unsubscribe = controller.subscribe((message) => {
    messages.push(message);
  });

  controller.showTransient("Loaded screenshot.", { durationMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(messages.at(-1), "Paste a screenshot to begin.");

  unsubscribe();
  controller.destroy();
  machineHost.destroy();
});

test("status controller renders machine feedback through the canonical formatter", () => {
  const machineHost = createMachineHost();
  const controller = createStatusController({ machineHost });
  const messages = [];
  const unsubscribe = controller.subscribe((message) => {
    messages.push(message);
  });

  controller.showMachineFeedback({
    kind: MACHINE_FEEDBACK_KIND.UNDO,
    message: "Moved overlay",
  }, { durationMs: 0 });

  assert.equal(messages.at(-1), "Undid: Moved overlay.");

  unsubscribe();
  controller.destroy();
  machineHost.destroy();
});

test("status controller reacts to pin and solve events", () => {
  const machineHost = createMachineHost();
  const eventListeners = new Set();
  const interactions = {
    subscribeEvents(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
  };

  const controller = createStatusController({ machineHost, interactions });
  for (const listener of eventListeners) {
    listener({
      type: INTERACTION_EVENT.PIN_RESULT,
      result: { ok: true, action: "added", pin: { id: 1 } },
    });
  }
  assert.equal(controller.getMessage(), "Added pin 1.");

  for (const listener of eventListeners) {
    listener({
      type: INTERACTION_EVENT.SOLVE_RESULT,
      result: { ok: false, reason: "insufficient-pins", pinCount: 1 },
    });
  }
  assert.equal(
    controller.getMessage(),
    "Need at least 2 pins to compute a transform. Current pins: 1.",
  );

  for (const listener of eventListeners) {
    listener({ type: INTERACTION_EVENT.PINS_CLEARED });
  }
  assert.equal(controller.getMessage(), "Cleared all registration pins.");

  controller.destroy();
  machineHost.destroy();
});

test("status controller uses machine state for baseline panel prompts", () => {
  const machineHost = createMachineHost();
  const controller = createStatusController({ machineHost });

  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
  });

  assert.equal(
    controller.getMessage(),
    "Press Ctrl/Cmd+V to paste an image from your clipboard.",
  );

  controller.destroy();
  machineHost.destroy();
});

test("status presentation helpers remain independent from controller plumbing", () => {
  assert.equal(
    describePinResultPresentation({ ok: true, action: "added", pin: { id: 3 } }),
    "Added pin 3.",
  );
  assert.equal(
    describeSolveResultPresentation({ ok: true, pinCount: 3 }),
    "Computed transform from 3 pin(s).",
  );
  assert.equal(
    describeInteractionEventPresentation({
      type: INTERACTION_EVENT.PIN_RESULT,
      result: { ok: true, action: "added", pin: { id: 3 } },
    }),
    "Added pin 3.",
  );
  assert.equal(
    PANEL_FEEDBACK_ACTION.PASTE_CANCELLED,
    "paste-cancelled",
  );
});
