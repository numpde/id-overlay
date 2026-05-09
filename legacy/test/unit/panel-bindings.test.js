import test from "node:test";
import assert from "node:assert/strict";

import { bindPanelControls } from "../../src/content/panel-bindings.js";
import { createPanelElements } from "../../src/content/panel-elements.js";
import { createDomEnvironment } from "../helpers/dom-env.js";

test("panel bindings report control activations through panel commands", () => {
  const env = createDomEnvironment();
  try {
    const elements = createPanelElements({
      ownerDocument: env.document,
      buildLabel: "built test",
    });
    const calls = [];
    const bindings = bindPanelControls({
      elements,
      panelCommands: createPanelCommandRecorder(calls),
    });

    elements.modeInput.checked = true;
    elements.modeInput.dispatchEvent(new env.window.Event("change", { bubbles: true }));
    elements.modeSwitch.dispatchEvent(new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    }));
    elements.opacityInput.value = "0.33";
    elements.opacityInput.dispatchEvent(new env.window.Event("input", { bubbles: true }));
    elements.opacityInput.dispatchEvent(new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -50,
    }));
    elements.mainActionButton.click();
    elements.undoButton.click();
    elements.redoButton.click();

    assert.deepEqual(calls, [
      ["mode", { checked: true }],
      ["mode-step", { deltaY: 100 }],
      ["opacity", "0.33"],
      ["opacity-wheel", { value: "0.33", deltaY: -50 }],
      ["primary"],
      ["undo"],
      ["redo"],
    ]);

    bindings.destroy();
  } finally {
    env.cleanup();
  }
});

test("panel bindings preserve disabled guards and wheel event ownership", () => {
  const env = createDomEnvironment();
  try {
    const elements = createPanelElements({
      ownerDocument: env.document,
      buildLabel: "built test",
    });
    elements.modeInput.disabled = true;
    elements.opacityInput.disabled = true;
    elements.undoButton.disabled = true;
    elements.redoButton.disabled = true;

    const calls = [];
    const bindings = bindPanelControls({
      elements,
      panelCommands: createPanelCommandRecorder(calls),
    });

    let bubbledModeWheel = false;
    let bubbledOpacityWheel = false;
    elements.root.addEventListener("wheel", (event) => {
      if (event.target === elements.modeSwitch) {
        bubbledModeWheel = true;
      }
      if (event.target === elements.opacityInput) {
        bubbledOpacityWheel = true;
      }
    });

    const disabledModeWheel = new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 1,
    });
    elements.modeSwitch.dispatchEvent(disabledModeWheel);
    const disabledOpacityWheel = new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 1,
    });
    elements.opacityInput.dispatchEvent(disabledOpacityWheel);
    elements.modeInput.dispatchEvent(new env.window.Event("change", { bubbles: true }));
    elements.undoButton.click();
    elements.redoButton.click();

    assert.deepEqual(calls, []);
    assert.equal(disabledModeWheel.defaultPrevented, false);
    assert.equal(disabledOpacityWheel.defaultPrevented, false);
    assert.equal(bubbledModeWheel, true);
    assert.equal(bubbledOpacityWheel, true);

    elements.modeInput.disabled = false;
    elements.opacityInput.disabled = false;
    elements.opacityInput.value = "0.5";
    const activeModeWheel = new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 2,
    });
    elements.modeSwitch.dispatchEvent(activeModeWheel);
    const activeOpacityWheel = new env.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 3,
    });
    elements.opacityInput.dispatchEvent(activeOpacityWheel);

    assert.deepEqual(calls, [
      ["mode-step", { deltaY: 2 }],
      ["opacity-wheel", { value: "0.5", deltaY: 3 }],
    ]);
    assert.equal(activeModeWheel.defaultPrevented, true);
    assert.equal(activeOpacityWheel.defaultPrevented, true);

    bindings.destroy();
  } finally {
    env.cleanup();
  }
});

test("panel bindings remove control listeners on destroy", () => {
  const env = createDomEnvironment();
  try {
    const elements = createPanelElements({
      ownerDocument: env.document,
      buildLabel: "built test",
    });
    const calls = [];
    const bindings = bindPanelControls({
      elements,
      panelCommands: createPanelCommandRecorder(calls),
    });

    bindings.destroy();
    elements.mainActionButton.click();

    assert.deepEqual(calls, []);
  } finally {
    env.cleanup();
  }
});

function createPanelCommandRecorder(calls) {
  return {
    activatePanelMode(payload) {
      calls.push(["mode", payload]);
    },
    activatePanelModeStep(payload) {
      calls.push(["mode-step", payload]);
    },
    changePanelOpacity(value) {
      calls.push(["opacity", value]);
    },
    changePanelOpacityByWheel(payload) {
      calls.push(["opacity-wheel", payload]);
    },
    activatePanelPrimary() {
      calls.push(["primary"]);
    },
    activateUndo() {
      calls.push(["undo"]);
    },
    activateRedo() {
      calls.push(["redo"]);
    },
  };
}
