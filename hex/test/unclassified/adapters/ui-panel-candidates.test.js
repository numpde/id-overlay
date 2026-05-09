import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createPanelAdapter,
} from "../../../adapters/ui/panel-adapter.js";

// Unclassified candidate: panel DOM is a projection of a view model. The UI
// adapter should not need application state to decide labels or disabled state.
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

// Unclassified candidate: the panel emits semantic application commands. It
// must not call ports or mutate application state directly.
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

// Unclassified candidate: panel dragging is shell behavior. It may update panel
// position, but it should not emit product commands.
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
