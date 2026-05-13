import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createPanelAdapter,
} from "../../../adapters/ui/panel-adapter.js";

// Class-b, deliberately not class-a: DOM markers are adapter-local handles, and
// the exact panel markup can change. The stable boundary is that labels,
// disabled states, history tooltips, and status copy are selected before the
// adapter; the panel only renders the view model it is given.
test("panel adapter renders from the view model only", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const panel = createPanelAdapter({
    document: window.document,
  });

  const root = panel.render({
    primaryAction: {
      label: "Paste",
      enabled: true,
    },
    modeSwitch: {
      selected: "trace",
      align: {
        enabled: false,
      },
    },
    history: {
      undo: {
        enabled: false,
        label: null,
      },
      redo: {
        enabled: true,
        label: "Reload image",
      },
    },
    status: "Clipboard does not contain an image.",
  });

  assert.equal(root.querySelector("[data-control='primary']").textContent, "Paste");
  assert.equal(root.querySelector("[data-control='align']").disabled, true);
  assert.equal(root.querySelector("[data-control='redo']").title, "Reload image");
  assert.equal(
    root.querySelector("[data-region='status']").textContent,
    "Clipboard does not contain an image.",
  );
});

// Class-b, deliberately not class-a: button markup and click wiring are
// adapter vocabulary. The stable boundary is that DOM events cross inward only
// as semantic commands, never as elements, labels, or view-model fragments.
test("panel adapter emits semantic commands only", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const commands = [];
  const panel = createPanelAdapter({
    document: window.document,
    emitCommand(command) {
      commands.push(command);
    },
  });
  const root = panel.render({
    primaryAction: {
      label: "Paste",
      enabled: true,
    },
    modeSwitch: {
      selected: "trace",
      align: {
        enabled: true,
      },
    },
    history: {
      undo: {
        enabled: true,
        label: "Remove image",
      },
      redo: {
        enabled: true,
        label: "Reload image",
      },
    },
    status: "Loaded screenshot 640x480.",
  });

  root.querySelector("[data-control='primary']").click();
  root.querySelector("[data-control='align']").click();
  root.querySelector("[data-control='undo']").click();
  root.querySelector("[data-control='redo']").click();

  assert.deepEqual(commands, [
    {
      kind: "activate-primary-action",
    },
    {
      kind: "select-mode",
      mode: "align",
    },
    {
      kind: "undo",
    },
    {
      kind: "redo",
    },
  ]);
});

// Class-b: panel wheel ergonomics are adapter-local browser handling. Wheel
// events over enabled controls cross inward as semantic commands, and the page
// never receives raw wheel input from a consumed panel gesture.
test("panel mode switch wheel selects Align on wheel-up and Trace on wheel-down", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const commands = [];
  let bubbledWheelCount = 0;
  window.document.body.addEventListener("wheel", () => {
    bubbledWheelCount += 1;
  });
  const panel = createPanelAdapter({
    document: window.document,
    emitCommand(command) {
      commands.push(command);
    },
  });

  const traceRoot = panel.render(panelView({
    mode: "trace",
  }));
  window.document.body.append(traceRoot);
  const traceModeSwitch = traceRoot.querySelector("[data-control='mode-switch']");
  assert.ok(traceModeSwitch, "mode switch control should be rendered");
  const wheelUp = wheelEvent(window, {
    deltaY: -100,
  });
  traceModeSwitch.dispatchEvent(wheelUp);

  const alignRoot = panel.render(panelView({
    mode: "align",
  }));
  window.document.body.replaceChildren(alignRoot);
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
  assert.equal(bubbledWheelCount, 0);
});

// Class-b: opacity wheel changes reuse the semantic opacity command path. The
// application sees the next opacity value, not DOM deltas or slider internals.
test("panel opacity wheel emits a semantic opacity command", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const commands = [];
  let bubbledWheelCount = 0;
  window.document.body.addEventListener("wheel", () => {
    bubbledWheelCount += 1;
  });
  const panel = createPanelAdapter({
    document: window.document,
    emitCommand(command) {
      commands.push(command);
    },
  });
  const root = panel.render(panelView({
    opacity: 0.6,
  }));
  window.document.body.append(root);
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
  assert.equal(bubbledWheelCount, 0);
});

// Class-b: disabled wheel controls stay inert and allow normal bubbling. This
// preserves page ergonomics when no image session is loaded or a control is
// disabled by the view model.
test("disabled panel wheel controls do not emit commands or consume wheel events", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const commands = [];
  let bubbledWheelCount = 0;
  window.document.body.addEventListener("wheel", () => {
    bubbledWheelCount += 1;
  });
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
  window.document.body.append(root);
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
  assert.equal(bubbledWheelCount, 2);
});

// Class-b, deliberately not class-a: panel placement is runtime UI chrome, not
// product state. The adapter may persist its local shell position, but dragging
// the shell must not emit application commands.
test("panel drag is adapter-local", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const commands = [];
  const positions = [];
  const panel = createPanelAdapter({
    document: window.document,
    emitCommand(command) {
      commands.push(command);
    },
    writePanelPosition(position) {
      positions.push(position);
    },
  });

  panel.dragPanel({
    fromScreenPx: {
      x: 10,
      y: 20,
    },
    toScreenPx: {
      x: 30,
      y: 55,
    },
  });

  assert.deepEqual(commands, []);
  assert.deepEqual(positions, [{
    x: 20,
    y: 35,
  }]);
});

// Class-b, deliberately not class-a: exact markup remains adapter-local. The
// stable accessibility boundary is that semantic labels selected by the view
// model also name the controls for assistive technology, and mode selection is
// exposed as state instead of only as color or position.
test("panel adapter exposes accessible control names and selected mode state", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const panel = createPanelAdapter({
    document: window.document,
  });

  const root = panel.render({
    primaryAction: {
      label: "Clear image",
      enabled: true,
    },
    modeSwitch: {
      selected: "align",
      align: {
        enabled: true,
      },
    },
    history: {
      undo: {
        enabled: true,
        label: "Move overlay",
      },
      redo: {
        enabled: false,
        label: null,
      },
    },
    status: "Loaded screenshot 640x480.",
  });

  assert.equal(root.querySelector("[data-control='primary']").getAttribute("aria-label"), "Clear image");
  assert.equal(root.querySelector("[data-control='align']").getAttribute("aria-pressed"), "true");
  assert.equal(root.querySelector("[data-control='align']").getAttribute("aria-label"), "Align mode");
  assert.equal(root.querySelector("[data-control='undo']").getAttribute("aria-label"), "Move overlay");
  assert.equal(root.querySelector("[data-control='redo']").getAttribute("aria-label"), "Redo");
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
