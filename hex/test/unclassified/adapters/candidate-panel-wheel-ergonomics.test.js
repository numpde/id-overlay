import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createPanelAdapter,
} from "../../../adapters/ui/panel-adapter.js";

// Unclassified candidate: legacy panel controls supported wheel ergonomics, but
// the final hex panel markup and control vocabulary are unsettled. This
// candidate keeps the browser event at the adapter edge: wheel-up/down over the
// mode switch emits semantic mode commands, never raw wheel facts.
test("panel mode switch wheel selects Align on wheel-up and Trace on wheel-down", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const commands = [];
  const panel = createPanelAdapter({
    document: window.document,
    emitCommand(command) {
      commands.push(command);
    },
  });

  const traceRoot = panel.render(panelView({
    mode: "trace",
  }));
  const traceModeSwitch = traceRoot.querySelector("[data-control='mode-switch']");
  assert.ok(traceModeSwitch, "mode switch control should be rendered");
  const wheelUp = wheelEvent(window, {
    deltaY: -100,
  });
  traceModeSwitch.dispatchEvent(wheelUp);

  const alignRoot = panel.render(panelView({
    mode: "align",
  }));
  const alignModeSwitch = alignRoot.querySelector("[data-control='mode-switch']");
  assert.ok(alignModeSwitch, "mode switch control should be rendered");
  const wheelDown = wheelEvent(window, {
    deltaY: 100,
  });
  alignModeSwitch.dispatchEvent(wheelDown);

  assert.deepEqual(commands, [
    {
      kind: "select-mode",
      mode: "align",
    },
    {
      kind: "select-mode",
      mode: "trace",
    },
  ]);
  assert.equal(wheelUp.defaultPrevented, true);
  assert.equal(wheelDown.defaultPrevented, true);
});

// Unclassified candidate: opacity wheel changes should reuse the semantic
// opacity command path. The app sees the next opacity value, not DOM deltas or
// slider internals.
test("panel opacity wheel emits a semantic opacity command", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const commands = [];
  const panel = createPanelAdapter({
    document: window.document,
    emitCommand(command) {
      commands.push(command);
    },
  });
  const root = panel.render(panelView({
    opacity: 0.6,
  }));
  const opacityControl = root.querySelector("[data-control='opacity']");
  assert.ok(opacityControl, "opacity control should be rendered");
  const wheelUp = wheelEvent(window, {
    deltaY: -100,
  });

  opacityControl.dispatchEvent(wheelUp);

  assert.deepEqual(commands, [{
    kind: "set-opacity",
    opacity: 0.7,
  }]);
  assert.equal(wheelUp.defaultPrevented, true);
});

// Unclassified candidate: disabled wheel controls should remain inert and allow
// normal bubbling. This preserves page ergonomics when no image session is
// loaded or when a control is disabled by the view model.
test("disabled panel wheel controls do not emit commands or consume wheel events", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const commands = [];
  const panel = createPanelAdapter({
    document: window.document,
    emitCommand(command) {
      commands.push(command);
    },
  });
  const root = panel.render(panelView({
    mode: "trace",
    hasImage: false,
    opacityEnabled: false,
  }));
  const modeSwitch = root.querySelector("[data-control='mode-switch']");
  const opacityControl = root.querySelector("[data-control='opacity']");
  assert.ok(modeSwitch, "mode switch control should be rendered");
  assert.ok(opacityControl, "opacity control should be rendered");
  const modeWheel = wheelEvent(window);
  const opacityWheel = wheelEvent(window);

  modeSwitch.dispatchEvent(modeWheel);
  opacityControl.dispatchEvent(opacityWheel);

  assert.deepEqual(commands, []);
  assert.equal(modeWheel.defaultPrevented, false);
  assert.equal(opacityWheel.defaultPrevented, false);
});

function panelView({
  mode = "align",
  hasImage = true,
  opacity = 0.6,
  opacityEnabled = true,
} = {}) {
  return {
    mode,
    primaryAction: {
      label: hasImage ? "Clear image" : "Paste",
      enabled: true,
    },
    modeSwitch: {
      selected: mode,
      align: {
        enabled: hasImage,
      },
      trace: {
        enabled: hasImage,
      },
    },
    opacityControl: {
      value: opacity,
      min: 0,
      max: 1,
      step: 0.1,
      enabled: hasImage && opacityEnabled,
    },
    history: {
      undo: {
        enabled: false,
        label: null,
      },
      redo: {
        enabled: false,
        label: null,
      },
    },
    status: hasImage ? "Loaded screenshot 640x480." : "",
  };
}

function wheelEvent(window, { deltaY = 100 } = {}) {
  return new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY,
  });
}
