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

// Class-b: moving the panel shell is runtime UI chrome, not product intent.
// It may persist adapter-local position but must not emit app commands.
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
