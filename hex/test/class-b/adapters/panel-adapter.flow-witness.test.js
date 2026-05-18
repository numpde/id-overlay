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
    panelTitle: "Overlay: no image",
    primaryAction: {
      label: "Paste",
      enabled: true,
    },
    ...centerActions({
      hasImage: false,
      overlayLabel: "Move overlay into view",
      mapLabel: "Move map to overlay",
    }),
    modeSwitch: {
      selected: "trace",
      align: {
        enabled: false,
      },
      trace: {
        enabled: false,
      },
    },
    opacityControl: opacityControlView({
      enabled: false,
    }),
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

  assert.equal(root.querySelector(".id-overlay-panel__title").textContent, "Overlay: no image");
  assert.equal(root.querySelector("[data-control='primary']").textContent, "Paste");
  assert.equal(root.querySelector("[data-control='center-overlay']").textContent, "");
  assert.equal(root.querySelector("[data-control='center-overlay']").getAttribute("aria-label"), "Move overlay into view");
  assert.ok(root.querySelector("[data-control='center-overlay'] svg"));
  assert.equal(root.querySelector("[data-control='center-map']").textContent, "");
  assert.equal(root.querySelector("[data-control='center-map']").getAttribute("aria-label"), "Move map to overlay");
  assert.ok(root.querySelector("[data-control='center-map'] svg"));
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
  assert.equal(root.querySelector(".id-overlay-panel__title").textContent, "Overlay: trace mode");
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
  const centerOverlayCommandKind = "test-center-overlay-command";
  const centerMapCommandKind = "test-center-map-command";
  const root = harness.render({
    panelTitle: "Overlay: trace mode",
    primaryAction: {
      label: "Paste",
      enabled: true,
    },
    centerOverlayInViewAction: {
      kind: centerOverlayCommandKind,
      label: "Center overlay in view",
      enabled: true,
      icon: "center-overlay",
    },
    centerMapOnOverlayAction: {
      kind: centerMapCommandKind,
      label: "Center map on overlay",
      enabled: true,
      icon: "center-map",
    },
    modeSwitch: {
      selected: "trace",
      align: {
        enabled: true,
      },
      trace: {
        enabled: true,
      },
    },
    opacityControl: opacityControlView(),
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
  harness.clickControl(root, "center-overlay");
  harness.clickControl(root, "center-map");
  harness.trace.edge(flowEdge(`command.${centerOverlayCommandKind}`, "sink.application-command", {
    terminal: "adapter-emitted-command",
  }));
  harness.trace.edge(flowEdge(`command.${centerMapCommandKind}`, "sink.browser-shell-command", {
    terminal: "shell-owned-command",
  }));
  harness.clickModeSwitch(root);
  harness.clickControl(root, "undo");
  harness.clickControl(root, "redo");

  assert.deepEqual(harness.commands, [
    {
      kind: "activate-primary-action",
    },
    {
      kind: centerOverlayCommandKind,
    },
    {
      kind: centerMapCommandKind,
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
    flowEdge("source.panel.center-overlay.click", `command.${centerOverlayCommandKind}`, {
      provider: "panel-adapter",
    }),
    flowEdge("source.panel.center-map.click", `command.${centerMapCommandKind}`, {
      provider: "panel-adapter",
    }),
    flowEdge(`command.${centerOverlayCommandKind}`, "sink.application-command", {
      terminal: "adapter-emitted-command",
    }),
    flowEdge(`command.${centerMapCommandKind}`, "sink.browser-shell-command", {
      terminal: "shell-owned-command",
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
    opacityStep: 0.1,
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

// Class-b: range input is a continuous browser-owned interaction. While the
// thumb is moving, the adapter may update local UI, but it must not emit a
// semantic durable command until the browser commits the value with `change`.
test("panel opacity slider input previews locally and commits on change", () => {
  const harness = createPanelHarness({
    test: "panel opacity slider input previews locally and commits on change",
  });
  const root = harness.render(panelView({
    opacity: 0.6,
    opacityStep: 0.1,
  }));
  const opacityControl = root.querySelector("[data-control='opacity']");
  assert.ok(opacityControl, "opacity control should be rendered");

  opacityControl.value = "0.35";
  harness.trace.withSource("source.panel.opacity.input", () => {
    opacityControl.dispatchEvent(new harness.window.Event("input", {
      bubbles: true,
    }));
  });

  assert.deepEqual(harness.commands, []);
  assert.equal(opacityControl.value, "0.35");
  harness.trace.edge(flowEdge("source.panel.opacity.input", "sink.panel-dom", {
    phase: "local-preview",
    terminal: "render-result",
  }));

  harness.trace.withSource("source.panel.opacity.change", () => {
    opacityControl.dispatchEvent(new harness.window.Event("change", {
      bubbles: true,
    }));
  });

  assert.deepEqual(harness.commands, [{
    kind: "set-opacity",
    opacity: 0.35,
  }]);
  assert.deepEqual(commandEdges(harness.trace), [
    flowEdge("source.panel.opacity.change", "command.set-opacity", {
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
  assert.deepEqual(harness.trace.edges.filter((edge) => edge.to === "inert.panel-control"), [
    flowEdge("source.panel.mode-switch.wheel", "inert.panel-control", {
      terminal: "intentionally-inert",
    }),
    flowEdge("source.panel.opacity.wheel", "inert.panel-control", {
      terminal: "intentionally-inert",
    }),
  ]);
});

// Class-b: wheel input that points at the currently selected mode is a UI
// no-op. The adapter should not send redundant app commands for state the view
// model already declares.
test("panel mode switch wheel toward current mode stays inert", () => {
  const harness = createPanelHarness({
    test: "panel mode switch wheel toward current mode stays inert",
  });
  harness.countBodyWheelEvents();
  const root = harness.render(panelView({
    mode: "trace",
  }));
  harness.window.document.body.append(root);
  const modeSwitch = root.querySelector("[data-control='mode-switch']");
  const wheelTowardTrace = wheelEvent(harness.window, {
    deltaY: 100,
  });

  harness.dispatchWheel(modeSwitch, "mode-switch", wheelTowardTrace, {
    phase: "current-mode",
  });

  assert.deepEqual(harness.commands, []);
  assert.equal(wheelTowardTrace.defaultPrevented, false);
  assert.equal(harness.bubbledWheelCount, 1);
  assert.deepEqual(harness.trace.edges.filter((edge) => edge.to === "inert.panel-control"), [
    flowEdge("source.panel.mode-switch.wheel", "inert.panel-control", {
      phase: "current-mode",
      terminal: "intentionally-inert",
    }),
  ]);
});

// Class-b: mode availability is endpoint-specific view-model state. If the
// view says Align is unavailable, browser gestures over the switch must not
// smuggle an Align command inward just because Trace remains enabled.
test("panel mode switch does not emit commands for disabled target modes", () => {
  const harness = createPanelHarness({
    test: "panel mode switch does not emit commands for disabled target modes",
  });
  harness.countBodyWheelEvents();
  const root = harness.render(panelView({
    mode: "trace",
    alignEnabled: false,
    traceEnabled: true,
  }));
  harness.window.document.body.append(root);
  const modeSwitch = root.querySelector("[data-control='mode-switch']");
  const modeInput = modeSwitch.querySelector("input");
  const wheelToAlign = wheelEvent(harness.window, {
    deltaY: -100,
  });

  harness.dispatchWheel(modeSwitch, "mode-switch", wheelToAlign, {
    phase: "align-disabled",
  });
  harness.clickModeSwitch(root);

  assert.equal(modeInput.disabled, true);
  assert.deepEqual(harness.commands, []);
  assert.equal(wheelToAlign.defaultPrevented, false);
  assert.equal(harness.bubbledWheelCount, 1);
  assert.deepEqual(harness.trace.edges.filter((edge) => edge.to === "inert.panel-control"), [
    flowEdge("source.panel.mode-switch.wheel", "inert.panel-control", {
      phase: "align-disabled",
      terminal: "intentionally-inert",
    }),
  ]);
});

// Class-b: panel drag is a continuous browser-owned interaction. Pointer moves
// must preview the panel position locally; shell preference persistence happens
// once, when the pointer sequence commits.
test("panel drag previews locally and commits one shell position on release", () => {
  const harness = createPanelHarness({
    test: "panel drag previews locally and commits one shell position on release",
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

  const header = root.querySelector(".id-overlay-panel__header");
  harness.trace.withSource("source.panel.drag.start", () => {
    header.dispatchEvent(new harness.window.MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 120,
      clientY: 70,
    }));
  });
  harness.trace.withSource("source.panel.drag.preview", () => {
    harness.window.dispatchEvent(new harness.window.MouseEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 150,
      clientY: 100,
    }));
  });

  assert.deepEqual(harness.positions, []);
  assert.deepEqual(harness.previewActiveStates, [true]);
  assert.deepEqual(harness.previewPositions, [{
    requestedScreenPx: {
      x: 130,
      y: 80,
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
  assert.equal(root.classList.contains("id-overlay-panel--dragging"), true);
  harness.trace.edge(flowEdge("source.panel.drag.preview", "sink.panel-dom", {
    phase: "local-preview",
    terminal: "render-result",
  }));

  harness.trace.withSource("source.panel.drag.preview", () => {
    harness.window.dispatchEvent(new harness.window.MouseEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 180,
      clientY: 140,
    }));
  });

  assert.deepEqual(harness.positions, []);
  assert.deepEqual(harness.previewPositions.at(-1), {
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
  });
  harness.trace.edge(flowEdge("source.panel.drag.preview", "sink.panel-dom", {
    phase: "local-preview-2",
    terminal: "render-result",
  }));

  harness.trace.withSource("source.panel.drag.commit", () => {
    harness.window.dispatchEvent(new harness.window.MouseEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 180,
      clientY: 140,
    }));
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
  assert.deepEqual(harness.previewActiveStates, [true, false]);
  assert.equal(root.classList.contains("id-overlay-panel--dragging"), false);
  assert.deepEqual(harness.trace.edges, [
    flowEdge("view.panel", "sink.panel-dom", {
      terminal: "render-result",
    }),
    flowEdge("source.panel.drag.preview", "sink.panel-dom", {
      phase: "local-preview",
      terminal: "render-result",
    }),
    flowEdge("source.panel.drag.preview", "sink.panel-dom", {
      phase: "local-preview-2",
      terminal: "render-result",
    }),
    flowEdge("source.panel.drag.commit", "sink.panel-chrome.position", {
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
    panelTitle: "Overlay: align mode",
    primaryAction: {
      label: "Clear image",
      enabled: true,
    },
    ...centerActions(),
    modeSwitch: {
      selected: "align",
      align: {
        enabled: true,
      },
      trace: {
        enabled: true,
      },
    },
    opacityControl: opacityControlView(),
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

// Class-b: the armed primary action is still the primary command, but the
// adapter must expose its confirmation state to chrome styling from explicit
// view facts. Copy is presentation, so punctuation must not control button
// severity.
test("panel adapter marks armed primary confirmation actions from view facts", () => {
  const harness = createPanelHarness({
    test: "panel adapter marks armed primary confirmation actions from view facts",
  });

  const root = harness.render({
    panelTitle: "Overlay: align mode",
    primaryAction: {
      label: "Clear image",
      enabled: true,
      tone: "danger",
      confirmation: "armed",
    },
    ...centerActions(),
    modeSwitch: {
      selected: "align",
      align: {
        enabled: true,
      },
      trace: {
        enabled: true,
      },
    },
    opacityControl: opacityControlView(),
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
    status: "Press again to clear the image.",
  });

  const primary = root.querySelector("[data-control='primary']");
  assert.equal(primary.classList.contains("id-overlay-button--primary"), true);
  assert.equal(primary.classList.contains("id-overlay-button--confirm"), true);
  assert.equal(primary.dataset.tone, "danger");
  assert.equal(primary.dataset.confirmation, "armed");
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
  const previewPositions = [];
  const previewActiveStates = [];
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
    previewPanelPosition(position) {
      previewPositions.push(position);
    },
    setPanelPositionPreviewActive(active) {
      previewActiveStates.push(active);
    },
  });

  return {
    window,
    trace,
    commands,
    positions,
    previewPositions,
    previewActiveStates,
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
        trace.edge(flowEdge(source, "inert.panel-control", {
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
  opacityStep = 0.01,
  opacityEnabled = true,
  alignEnabled = hasImage,
  traceEnabled = hasImage,
} = {}) {
  return {
    mode,
    panelTitle: hasImage ? `Overlay: ${mode} mode` : "Overlay: no image",
    primaryAction: {
      label: hasImage ? "Clear image" : "Paste",
      enabled: true,
    },
    ...centerActions({ hasImage }),
    modeSwitch: {
      selected: mode,
      align: {
        enabled: alignEnabled,
      },
      trace: {
        enabled: traceEnabled,
      },
    },
    opacityControl: {
      value: opacity,
      min: 0,
      max: 1,
      step: opacityStep,
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

function opacityControlView({
  value = 1,
  min = 0,
  max = 1,
  step = 0.01,
  enabled = true,
} = {}) {
  return {
    value,
    min,
    max,
    step,
    enabled,
  };
}

function centerActions({
  hasImage = true,
  overlayLabel = "Center overlay in view",
  mapLabel = "Center map on overlay",
} = {}) {
  return {
    centerOverlayInViewAction: {
      kind: "center-overlay-in-view",
      label: overlayLabel,
      enabled: hasImage,
      icon: "center-overlay",
    },
    centerMapOnOverlayAction: {
      kind: "center-map-on-overlay",
      label: mapLabel,
      enabled: hasImage,
      icon: "center-map",
    },
  };
}

function wheelEvent(window, { deltaY = 100 } = {}) {
  return new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY,
  });
}
