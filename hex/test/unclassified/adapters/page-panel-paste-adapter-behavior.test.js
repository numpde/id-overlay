import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createOverlayAdapter,
} from "../../../adapters/ui/overlay-adapter.js";
import {
  createPanelAdapter,
} from "../../../adapters/ui/panel-adapter.js";

// Unclassified: paste can arrive from direct clipboard read or a paste event.
// Both should normalize into the same plain reference-image outcome before the
// application sees it.
test("paste adapter normalizes direct clipboard and paste-event image sources", async () => {
  const { createPasteImageAdapter } = await importRequired(
    "../../../adapters/web/paste-image-adapter.js",
    "createPasteImageAdapter",
  );
  const normalized = {
    kind: "accepted",
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
  const adapter = createPasteImageAdapter({
    readClipboardImageHandle: async () => ({
      kind: "image",
      imageHandle: {
        runtimeHandle: "clipboard-image",
      },
    }),
    normalizeImageHandle: async () => normalized,
  });

  assert.deepEqual(await adapter.readReferenceImage(), normalized);
  assert.deepEqual(await adapter.readReferenceImageFromPasteEvent({
    imageHandle: {
      runtimeHandle: "event-image",
    },
  }), normalized);
});

// Unclassified: Align mode wheel gestures are overlay commands. The adapter
// should emit plain facts and stop host bubbling; exact DOM event recovery can
// remain adapter-local.
test("overlay adapter emits wheel facts for opacity rotate scale and map forwarding", () => {
  const { window } = new JSDOM("<!doctype html><body><div id='surface'></div></body>");
  const facts = [];
  const surface = window.document.getElementById("surface");
  const overlay = createOverlayAdapter({
    emitInteractionFact(fact) {
      facts.push(fact);
    },
  });

  overlay.bindInput(surface);
  surface.dispatchEvent(new window.WheelEvent("wheel", {
    altKey: true,
    deltaY: -100,
    clientX: 120,
    clientY: 90,
    bubbles: true,
  }));
  surface.dispatchEvent(new window.WheelEvent("wheel", {
    ctrlKey: true,
    deltaY: -100,
    clientX: 120,
    clientY: 90,
    bubbles: true,
  }));
  surface.dispatchEvent(new window.WheelEvent("wheel", {
    shiftKey: true,
    deltaY: -100,
    clientX: 120,
    clientY: 90,
    bubbles: true,
  }));

  assert.deepEqual(facts.map((fact) => fact.kind), [
    "overlay-opacity-wheel",
    "overlay-rotate-wheel",
    "overlay-scale-wheel",
  ]);
});

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
