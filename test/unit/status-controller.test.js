import test from "node:test";
import assert from "node:assert/strict";

import { createStatusController } from "../../src/content/status-controller.js";
import {
  MACHINE_EVENT_KIND,
  MACHINE_FEEDBACK_KIND,
  MACHINE_PANEL_INTENT,
  createMachineHost,
} from "../../src/core/machine/index.js";

test("status controller falls back to derived status after machine-result feedback", async () => {
  const machineHost = createMachineHost();
  const controller = createStatusController({ machineHost, transientMs: 0 });
  const messages = [];
  const unsubscribe = controller.subscribe((message) => {
    messages.push(message);
  });

  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.REPORT_FEEDBACK,
    feedbackKind: MACHINE_FEEDBACK_KIND.CLIPBOARD_MISSING_IMAGE,
    message: "Clipboard does not contain an image.",
  });
  assert.equal(messages.at(-1), "Clipboard does not contain an image.");

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(messages.at(-1), "Paste a screenshot to begin.");

  unsubscribe();
  controller.destroy();
  machineHost.destroy();
});

test("status controller renders undo and redo feedback through the canonical formatter", () => {
  const machineHost = createMachineHost();
  const controller = createStatusController({ machineHost });

  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.REPORT_FEEDBACK,
    feedbackKind: MACHINE_FEEDBACK_KIND.UNDO,
    message: "Moved overlay",
  });
  assert.equal(controller.getMessage(), "Undid: Moved overlay.");

  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.REPORT_FEEDBACK,
    feedbackKind: MACHINE_FEEDBACK_KIND.REDO,
    message: "Moved overlay",
  });
  assert.equal(controller.getMessage(), "Redid: Moved overlay.");

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
