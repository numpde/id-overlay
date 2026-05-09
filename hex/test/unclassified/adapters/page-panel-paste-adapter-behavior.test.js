import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createPanelAdapter,
} from "../../../adapters/ui/panel-adapter.js";

// Unclassified: mode-switch wheel behavior was user-facing panel chrome. It
// should emit semantic mode selection, not DOM-specific wheel deltas.
test("panel adapter maps mode-switch wheel gestures to semantic mode selection", () => {
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
      label: "Clear image",
      enabled: true,
    },
    modeSwitch: {
      selected: "trace",
      align: {
        enabled: true,
      },
    },
    history: disabledHistory(),
    status: "",
  });

  assertOne(root, "[data-control='mode-switch']").dispatchEvent(
    new window.WheelEvent("wheel", {
      deltaY: -100,
      bubbles: true,
    }),
  );
  assertOne(root, "[data-control='mode-switch']").dispatchEvent(
    new window.WheelEvent("wheel", {
      deltaY: 100,
      bubbles: true,
    }),
  );

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
});

// Unclassified: panel drag is local chrome, but its stored/restored coordinates
// still need viewport clamping so the panel cannot be dragged offscreen forever.
test("panel position adapter clamps finite panel coordinates to viewport", async () => {
  const { resolvePanelPosition } = await importRequired(
    "../../../adapters/ui/panel-position-adapter.js",
    "resolvePanelPosition",
  );

  assert.deepEqual(resolvePanelPosition({
    requestedScreenPx: {
      x: -40,
      y: 900,
    },
    panelSizePx: {
      width: 240,
      height: 120,
    },
    viewportPx: {
      width: 800,
      height: 600,
    },
  }), {
    x: 0,
    y: 480,
  });
});

async function importRequired(specifier, exportName) {
  let module;
  try {
    module = await import(specifier);
  } catch {
    assert.fail(`missing module ${specifier}`);
  }
  if (typeof module[exportName] !== "function") {
    assert.fail(`missing export ${exportName} from ${specifier}`);
  }
  return module;
}

function disabledHistory() {
  return {
    undo: {
      enabled: false,
      label: "",
    },
    redo: {
      enabled: false,
      label: "",
    },
  };
}

function assertOne(root, selector) {
  const nodes = [...root.querySelectorAll(selector)];
  assert.equal(nodes.length, 1, `expected exactly one ${selector}`);
  return nodes[0];
}
