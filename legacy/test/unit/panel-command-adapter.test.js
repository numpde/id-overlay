import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
} from "../../src/core/machine/events.js";
import {
  createIdlePanel,
} from "../../src/core/machine/state.js";
import {
  selectPanelStatusText,
} from "../../src/core/machine/selectors.js";
import { createPanelCommandAdapter } from "../../src/content/panel-command-adapter.js";
import {
  addPin,
  createHost,
  createLoadedHost,
  NORMALIZED_IMAGE,
  loadImage,
} from "../helpers/machine-scenarios.js";

test("panel command adapter translates panel control values into semantic machine calls", () => {
  const calls = [];
  const adapter = createPanelCommandAdapter({
    machineHost: createMachineHostRecorder(calls),
  });

  adapter.activatePanelMode({ checked: true });
  adapter.activatePanelMode({ checked: false });
  adapter.activatePanelModeStep({ deltaY: -1 });
  adapter.activatePanelModeStep({ deltaY: 1 });
  adapter.changePanelOpacity("0.45");
  adapter.changePanelOpacity("not-a-number");
  adapter.changePanelOpacityByWheel({ value: "0.45", deltaY: -100 });
  adapter.activateUndo();
  adapter.activateRedo();

  assert.deepEqual(calls, [
    ["select-mode", MACHINE_MODE.TRACE],
    ["select-mode", MACHINE_MODE.ALIGN],
    ["select-mode", MACHINE_MODE.ALIGN],
    ["select-mode", MACHINE_MODE.TRACE],
    ["set-opacity", 0.45],
    ["set-opacity", 0.6],
    ["set-opacity", 0.55],
    ["undo"],
    ["redo"],
  ]);
});

test("panel command adapter interprets primary action from canonical machine state", () => {
  const host = createHost();
  const adapter = createPanelCommandAdapter({ machineHost: host });

  adapter.activatePanelPrimary();
  assert.equal(host.getState().panel.intent, MACHINE_PANEL_INTENT.PASTE_ARMED);

  adapter.activatePanelPrimary();
  assert.deepEqual(host.getState().panel, createIdlePanel());
  assert.equal(selectPanelStatusText(host.getState()), "Paste cancelled.");

  loadImage(host);
  addPin(host, {
    imagePx: { x: 10, y: 20 },
    mapLatLon: { lat: 1, lon: 2 },
  });

  adapter.activatePanelPrimary();
  assert.equal(host.getState().panel.intent, MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM);

  adapter.activatePanelPrimary();
  assert.equal(host.getState().session.registration.pins.length, 0);
  assert.deepEqual(host.getState().panel, createIdlePanel());

  adapter.activatePanelPrimary();
  assert.equal(host.getState().panel.intent, MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);

  adapter.activatePanelPrimary();
  assert.equal(host.getState().session.image, null);
  assert.deepEqual(host.getState().panel, createIdlePanel());
});

test("panel command adapter drives semantic mode opacity and history activations", () => {
  const host = createLoadedHost();
  const adapter = createPanelCommandAdapter({ machineHost: host });

  adapter.activatePanelMode({ checked: true });
  assert.equal(host.getState().session.mode, MACHINE_MODE.TRACE);

  adapter.activatePanelModeStep({ deltaY: -100 });
  assert.equal(host.getState().session.mode, MACHINE_MODE.ALIGN);

  adapter.changePanelOpacity("0.45");
  assert.equal(host.getState().session.opacity, 0.45);

  adapter.changePanelOpacityByWheel({ value: "0.45", deltaY: -100 });
  assert.equal(host.getState().session.opacity, 0.55);

  adapter.activateUndo();
  assert.equal(host.getState().session.image, null);

  adapter.activateRedo();
  assert.deepEqual(host.getState().session.image, NORMALIZED_IMAGE);
});

function createMachineHostRecorder(calls) {
  return {
    getState() {
      return {
        panel: createIdlePanel(),
        session: {
          image: null,
          registration: {
            pins: [],
          },
        },
      };
    },
    selectMode(mode) {
      calls.push(["select-mode", mode]);
    },
    setOpacity(opacity) {
      calls.push(["set-opacity", opacity]);
    },
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
    activateUndo() {
      calls.push(["undo"]);
    },
    activateRedo() {
      calls.push(["redo"]);
    },
  };
}
