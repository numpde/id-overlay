import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createPanelAdapter,
} from "../../../adapters/ui/panel-adapter.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: DOM markers are adapter-local handles, and
// the exact panel markup can change. The stable boundary is that labels,
// disabled states, history tooltips, and status copy are selected before the
// adapter; the panel only renders the view model it is given.
test("panel adapter renders from the view model only", () => {
  const harness = createPanelHarness({
    test: "panel adapter renders from the view model only",
  });

  const root = harness.render({
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
  assert.equal(root.querySelector("[data-control='mode-switch'] input").disabled, true);
  assert.equal(root.querySelector("[data-control='redo']").title, "Reload image");
  assert.equal(
    root.querySelector("[data-region='status']").textContent,
    "Clipboard does not contain an image.",
  );
  assert.deepEqual(harness.trace.edges, [
    flowEdge("view.panel", "sink.panel-dom", {
      terminal: "render-result",
    }),
  ]);
});

// Class-b: legacy panel UI is not a bag of raw buttons. The adapter owns the
// compact chrome structure: draggable title/header, icon history controls, a
// single accessible mode switch, opacity field, and duplicated status detail.
test("panel adapter renders legacy panel chrome", () => {
  const harness = createPanelHarness({
    test: "panel adapter renders legacy panel chrome",
  });

  const root = harness.render(panelView({
    mode: "trace",
    opacity: 0.42,
  }), {
    phase: "legacy-panel-chrome",
  });

  assert.equal(root.className, "id-overlay-panel");
  assert.equal(root.dataset.idOverlayOwned, "true");
  assert.equal(root.querySelector(".id-overlay-panel__header").title, "Drag to move");
  assert.equal(root.querySelector(".id-overlay-panel__title").textContent, "Reference Overlay");
  const repoLink = root.querySelector(".id-overlay-panel__repo-link");
  assert.equal(repoLink.getAttribute("aria-label"), "Open id-overlay on GitHub");
  assert.equal(repoLink.textContent, "");
  assert.ok(repoLink.querySelector(".id-overlay-panel__repo-icon"));
  assert.equal(root.querySelector("[data-control='undo']").textContent, "↶");
  assert.equal(root.querySelector("[data-control='redo']").textContent, "↷");

  const modeSwitch = root.querySelector(".id-overlay-mode-switch");
  const modeInput = modeSwitch.querySelector("input[type='checkbox']");
  assert.equal(modeSwitch.dataset.mode, "trace");
  assert.equal(modeSwitch.querySelector("[data-mode-option]"), null);
  assert.equal(modeSwitch.textContent, "");
  assert.equal(modeInput.checked, false);
  assert.equal(modeInput.getAttribute("aria-label"), "Mode: Trace");

  const opacityLabel = root.querySelector(".id-overlay-field__label");
  const opacityInput = root.querySelector("[data-control='opacity']");
  assert.equal(opacityLabel.textContent, "Opacity");
  assert.equal(opacityInput.type, "range");
  assert.equal(opacityInput.step, "0.01");
  assert.equal(opacityInput.value, "0.42");

  assert.equal(root.querySelector(".id-overlay-panel__status").textContent, "Loaded screenshot 640x480.");
  assert.equal(root.querySelector(".id-overlay-panel__status-detail-surface").textContent, "Loaded screenshot 640x480.");
  assert.deepEqual(harness.trace.edges, [
    flowEdge("view.panel", "sink.panel-dom", {
      phase: "legacy-panel-chrome",
      terminal: "render-result",
    }),
  ]);
});

// Class-b, deliberately not class-a: button markup and click wiring are
// adapter vocabulary. The stable boundary is that DOM events cross inward only
// as semantic commands, never as elements, labels, or view-model fragments.
test("panel adapter emits semantic commands only", () => {
  const harness = createPanelHarness({
    test: "panel adapter emits semantic commands only",
  });
  const root = harness.render({
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

  harness.clickControl(root, "primary");
  harness.clickModeSwitch(root);
  harness.clickControl(root, "undo");
  harness.clickControl(root, "redo");

  assert.deepEqual(harness.commands, [
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
  assert.deepEqual(harness.trace.edges.slice(1), [
    flowEdge("source.panel.primary.click", "command.activate-primary-action", {
      provider: "panel-adapter",
    }),
    flowEdge("source.panel.mode-switch.click", "command.select-mode", {
      provider: "panel-adapter",
    }),
    flowEdge("source.panel.undo.click", "command.undo", {
      provider: "panel-adapter",
    }),
    flowEdge("source.panel.redo.click", "command.redo", {
      provider: "panel-adapter",
    }),
  ]);
});

// Class-b: panel wheel ergonomics are adapter-local browser handling. Wheel
// events over enabled controls cross inward as semantic commands, and the page
// never receives raw wheel input from a consumed panel gesture.
test("panel mode switch wheel selects Align on wheel-up and Trace on wheel-down", () => {
  const harness = createPanelHarness({
    test: "panel mode switch wheel selects Align on wheel-up and Trace on wheel-down",
  });
  harness.countBodyWheelEvents();

  const traceRoot = harness.render(panelView({
    mode: "trace",
  }), {
    phase: "trace-mode-view",
  });
  harness.window.document.body.append(traceRoot);
  const traceModeSwitch = traceRoot.querySelector("[data-control='mode-switch']");
  assert.ok(traceModeSwitch, "mode switch control should be rendered");
  const wheelUp = wheelEvent(harness.window, {
    deltaY: -100,
  });
  harness.dispatchWheel(traceModeSwitch, "mode-switch", wheelUp, {
    phase: "wheel-up",
  });

  const alignRoot = harness.render(panelView({
    mode: "align",
  }), {
    phase: "align-mode-view",
  });
  harness.window.document.body.replaceChildren(alignRoot);
  const alignModeSwitch = alignRoot.querySelector("[data-control='mode-switch']");
  assert.ok(alignModeSwitch, "mode switch control should be rendered");
  const wheelDown = wheelEvent(harness.window, {
    deltaY: 100,
  });
  harness.dispatchWheel(alignModeSwitch, "mode-switch", wheelDown, {
    phase: "wheel-down",
  });

  assert.deepEqual(harness.commands, [
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
  assert.equal(harness.bubbledWheelCount, 0);
  assert.deepEqual(commandEdges(harness.trace), [
    flowEdge("source.panel.mode-switch.wheel", "command.select-mode", {
      phase: "wheel-up",
      provider: "panel-adapter",
    }),
    flowEdge("source.panel.mode-switch.wheel", "command.select-mode", {
      phase: "wheel-down",
      provider: "panel-adapter",
    }),
  ]);
});

// Class-b: opacity wheel changes reuse the semantic opacity command path. The
// application sees the next opacity value, not DOM deltas or slider internals.
test("panel opacity wheel emits a semantic opacity command", () => {
  const harness = createPanelHarness({
    test: "panel opacity wheel emits a semantic opacity command",
  });
  harness.countBodyWheelEvents();
  const root = harness.render(panelView({
    opacity: 0.6,
  }));
  harness.window.document.body.append(root);
  const opacityControl = root.querySelector("[data-control='opacity']");
  assert.ok(opacityControl, "opacity control should be rendered");
  const wheelUp = wheelEvent(harness.window, {
    deltaY: -100,
  });

  harness.dispatchWheel(opacityControl, "opacity", wheelUp);

  assert.deepEqual(harness.commands, [{
    kind: "set-opacity",
    opacity: 0.7,
  }]);
  assert.equal(wheelUp.defaultPrevented, true);
  assert.equal(harness.bubbledWheelCount, 0);
  assert.deepEqual(commandEdges(harness.trace), [
    flowEdge("source.panel.opacity.wheel", "command.set-opacity", {
      provider: "panel-adapter",
    }),
  ]);
});

// Class-b: disabled wheel controls stay inert and allow normal bubbling. This
// preserves page ergonomics when no image session is loaded or a control is
// disabled by the view model.
test("disabled panel wheel controls do not emit commands or consume wheel events", () => {
  const harness = createPanelHarness({
    test: "disabled panel wheel controls do not emit commands or consume wheel events",
  });
  harness.countBodyWheelEvents();
  const root = harness.render(panelView({
    mode: "trace",
    hasImage: false,
    opacityEnabled: false,
  }));
  harness.window.document.body.append(root);
  const modeSwitch = root.querySelector("[data-control='mode-switch']");
  const opacityControl = root.querySelector("[data-control='opacity']");
  assert.ok(modeSwitch, "mode switch control should be rendered");
  assert.ok(opacityControl, "opacity control should be rendered");
  const modeWheel = wheelEvent(harness.window);
  const opacityWheel = wheelEvent(harness.window);

  harness.dispatchWheel(modeSwitch, "mode-switch", modeWheel);
  harness.dispatchWheel(opacityControl, "opacity", opacityWheel);

  assert.deepEqual(harness.commands, []);
  assert.equal(modeWheel.defaultPrevented, false);
  assert.equal(opacityWheel.defaultPrevented, false);
  assert.equal(harness.bubbledWheelCount, 2);
  assert.deepEqual(harness.trace.edges.filter((edge) => edge.to === "inert.disabled-panel-control"), [
    flowEdge("source.panel.mode-switch.wheel", "inert.disabled-panel-control", {
      terminal: "intentionally-inert",
    }),
    flowEdge("source.panel.opacity.wheel", "inert.disabled-panel-control", {
      terminal: "intentionally-inert",
    }),
  ]);
});

// Class-b, deliberately not class-a: panel placement is runtime UI chrome, not
// product state. The adapter may persist its local shell position, but dragging
// the shell must not emit application commands.
test("panel drag is adapter-local", () => {
  const harness = createPanelHarness({
    test: "panel drag is adapter-local",
  });
  const root = harness.render(panelView());
  root.getBoundingClientRect = () => ({
    left: 100,
    top: 50,
    width: 280,
    height: 200,
    right: 380,
    bottom: 250,
    x: 100,
    y: 50,
    toJSON() {
      return this;
    },
  });

  harness.dragPanelHeader(root, {
    fromScreenPx: {
      x: 120,
      y: 70,
    },
    toScreenPx: {
      x: 180,
      y: 140,
    },
  });

  assert.deepEqual(harness.commands, []);
  assert.deepEqual(harness.positions, [{
    requestedScreenPx: {
      x: 160,
      y: 120,
    },
    panelSizePx: {
      width: 280,
      height: 200,
    },
    viewportPx: {
      width: 1024,
      height: 768,
    },
  }]);
  assert.equal(root.classList.contains("id-overlay-panel--dragging"), false);
  assert.deepEqual(harness.trace.edges, [
    flowEdge("view.panel", "sink.panel-dom", {
      terminal: "render-result",
    }),
    flowEdge("source.panel.drag", "sink.panel-chrome.position", {
      terminal: "shell-preference",
    }),
  ]);
});

// Class-b, deliberately not class-a: exact markup remains adapter-local. The
// stable accessibility boundary is that semantic labels selected by the view
// model also name the controls for assistive technology, and mode selection is
// exposed as state instead of only as color or position.
test("panel adapter exposes accessible control names and selected mode state", () => {
  const harness = createPanelHarness({
    test: "panel adapter exposes accessible control names and selected mode state",
  });

  const root = harness.render({
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
  assert.equal(root.querySelector("[data-control='mode-switch']").dataset.mode, "align");
  assert.equal(root.querySelector("[data-control='mode-switch'] input").checked, true);
  assert.equal(root.querySelector("[data-control='mode-switch'] input").getAttribute("aria-label"), "Mode: Align");
  assert.equal(root.querySelector("[data-control='undo']").getAttribute("aria-label"), "Move overlay");
  assert.equal(root.querySelector("[data-control='redo']").getAttribute("aria-label"), "Redo");
  assert.deepEqual(harness.trace.edges, [
    flowEdge("view.panel", "sink.panel-dom", {
      terminal: "render-result",
    }),
  ]);
});

function createPanelHarness({ test }) {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const trace = createFlowTrace({
    file: import.meta.url,
    test,
  });
  const commands = [];
  const positions = [];
  let bubbledWheelCount = 0;
  const panel = createPanelAdapter({
    document: window.document,
    emitCommand(command) {
      commands.push(command);
      trace.edge(flowEdge(trace.activeSource() ?? "source.panel-adapter", `command.${command.kind}`, {
        ...trace.activeAttributes(),
        provider: "panel-adapter",
      }));
    },
    writePanelPosition(position) {
      positions.push(position);
      trace.edge(flowEdge(trace.activeSource() ?? "source.panel.drag", "sink.panel-chrome.position", {
        terminal: "shell-preference",
      }));
    },
  });

  return {
    window,
    trace,
    commands,
    positions,
    get bubbledWheelCount() {
      return bubbledWheelCount;
    },
    countBodyWheelEvents() {
      window.document.body.addEventListener("wheel", () => {
        bubbledWheelCount += 1;
      });
    },
    render(view, attributes = {}) {
      const root = panel.render(view);
      trace.edge(flowEdge("view.panel", "sink.panel-dom", {
        ...attributes,
        terminal: "render-result",
      }));
      return root;
    },
    clickControl(root, control) {
      trace.withSource(`source.panel.${control}.click`, () => {
        root.querySelector(`[data-control='${control}']`).click();
      });
    },
    clickModeSwitch(root) {
      trace.withSource("source.panel.mode-switch.click", () => {
        const input = root.querySelector("[data-control='mode-switch'] input");
        input.checked = !input.checked;
        input.dispatchEvent(new window.Event("change", {
          bubbles: true,
        }));
      });
    },
    dispatchWheel(target, control, event, attributes = {}) {
      const commandCount = commands.length;
      const source = `source.panel.${control}.wheel`;
      trace.withAttributes(attributes, () => {
        trace.withSource(source, () => {
        target.dispatchEvent(event);
        });
      });
      if (commands.length === commandCount) {
        trace.edge(flowEdge(source, "inert.disabled-panel-control", {
          ...attributes,
          terminal: "intentionally-inert",
        }));
      }
    },
    dragPanelHeader(root, {
      fromScreenPx,
      toScreenPx,
    }) {
      trace.withSource("source.panel.drag", () => {
        const header = root.querySelector(".id-overlay-panel__header");
        header.dispatchEvent(new window.MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: fromScreenPx.x,
          clientY: fromScreenPx.y,
        }));
        window.dispatchEvent(new window.MouseEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: toScreenPx.x,
          clientY: toScreenPx.y,
        }));
        window.dispatchEvent(new window.MouseEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: toScreenPx.x,
          clientY: toScreenPx.y,
        }));
      });
    },
  };
}

function commandEdges(trace) {
  return trace.edges.filter((edge) => edge.to.startsWith("command."));
}

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
