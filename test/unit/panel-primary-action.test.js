import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_PANEL_INTENT,
} from "../../src/core/machine/events.js";
import { activatePanelPrimaryAction } from "../../src/core/machine/panel-primary-action.js";
import {
  addPin,
  createHost,
  loadImage,
} from "../helpers/machine-scenarios.js";

const PASTE_CANCELLED_NOTICE_KIND = "paste-cancelled";

test("panel primary action maps canonical primary action state to semantic commands", () => {
  const host = createHost();
  const calls = [];

  activatePanelPrimaryAction({
    state: host.getState(),
    actions: createActionsRecorder(calls),
  });
  host.requestPanelIntent(MACHINE_PANEL_INTENT.PASTE_ARMED);
  activatePanelPrimaryAction({
    state: host.getState(),
    actions: createActionsRecorder(calls),
  });

  loadImage(host);
  addPin(host);
  activatePanelPrimaryAction({
    state: host.getState(),
    actions: createActionsRecorder(calls),
  });
  host.requestPanelIntent(MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM);
  activatePanelPrimaryAction({
    state: host.getState(),
    actions: createActionsRecorder(calls),
  });
  host.clearPins();
  activatePanelPrimaryAction({
    state: host.getState(),
    actions: createActionsRecorder(calls),
  });
  host.requestPanelIntent(MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);
  activatePanelPrimaryAction({
    state: host.getState(),
    actions: createActionsRecorder(calls),
  });

  assert.deepEqual(calls, [
    ["request-panel-intent", MACHINE_PANEL_INTENT.PASTE_ARMED],
    ["cancel-panel-intent-with-status", {
      requestId: 1,
      noticeKind: PASTE_CANCELLED_NOTICE_KIND,
    }],
    ["request-panel-intent", MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM],
    ["clear-pins"],
    ["request-panel-intent", MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM],
    ["clear-image"],
  ]);
});

function createActionsRecorder(calls) {
  return {
    requestPanelIntent(intent) {
      calls.push(["request-panel-intent", intent]);
    },
    cancelPanelIntentWithStatusNotice(payload) {
      calls.push(["cancel-panel-intent-with-status", payload]);
    },
    clearPins() {
      calls.push(["clear-pins"]);
    },
    clearImage() {
      calls.push(["clear-image"]);
    },
  };
}
