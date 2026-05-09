import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createPanelAdapter,
} from "../../../adapters/ui/panel-adapter.js";

// Class-c: this usefully pressures the panel toward view-model rendering, but
// exact DOM markers and title placement are presentation details.
test("panel adapter renders from view model only", () => {
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

// Class-c: wheel-to-toggle on the mode switch may be useful panel chrome, but
// it is not yet an inevitable UI contract. Keep it quarantined until the switch
// shape and accessibility story are settled.
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
