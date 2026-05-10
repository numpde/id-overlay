import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createExtensionUiHost,
} from "../../../adapters/ui/extension-ui-host.js";
import {
  createPanelAdapter,
} from "../../../adapters/ui/panel-adapter.js";

// Unclassified: exact markup is adapter-local. The user-facing standard is not:
// icon-only controls and mode switches need accessible names derived from the
// same view model labels/tooltips that drive the visible UI.
test("candidate: panel controls expose accessible names and selected mode state", () => {
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

// Unclassified: focus choreography may evolve. The non-negotiable boundary is
// that passive startup must not steal focus from the map editor or page content.
test("candidate: mounting the extension does not steal page focus", () => {
  const { window } = new JSDOM("<!doctype html><body><button id='map-control'>Map</button></body>");
  const button = window.document.getElementById("map-control");
  button.focus();
  const host = createExtensionUiHost({
    document: window.document,
  });

  host.mountOwnedRoot("id-overlay");

  assert.equal(window.document.activeElement, button);
});
