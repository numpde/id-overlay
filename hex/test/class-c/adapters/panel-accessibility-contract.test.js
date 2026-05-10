import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createPanelAdapter,
} from "../../../adapters/ui/panel-adapter.js";

// Class-c: the accessibility requirement is real, but this test is not yet a
// class-b adapter contract because the current panel adapter does not expose the
// needed names/states. Keep it quarantined until the panel renderer is revised;
// then either promote this exact boundary or replace it with the stronger one.
test("panel controls expose accessible names and selected mode state", () => {
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
