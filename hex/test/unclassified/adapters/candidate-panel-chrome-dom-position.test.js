import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createExtensionUiHost,
} from "../../../adapters/ui/extension-ui-host.js";

// Unclassified candidate: legacy panel chrome persistence was user-visible only
// because the restored coordinates were applied to the rendered panel. Current
// class-b tests cover storage/clamping separately; this candidate covers the DOM
// application point without freezing the final panel markup.
test("extension UI host applies restored panel screen position to the panel DOM", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const uiHost = createExtensionUiHost({
    document: window.document,
  });
  const root = uiHost.mountOwnedRoot("id-overlay");

  uiHost.renderApplicationView({
    root,
    panelChrome: {
      position: {
        screenPx: {
          x: 42,
          y: 24,
        },
      },
    },
    view: createViewModel(),
    dispatchCommand() {},
  });

  assert.equal(root.panel.style.left, "42px");
  assert.equal(root.panel.style.top, "24px");
  assert.equal(root.panel.style.right, "auto");
  assert.equal(root.panel.style.bottom, "auto");
});

function createViewModel() {
  return {
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
        enabled: false,
        label: null,
      },
    },
    status: "",
    overlay: {
      visible: false,
    },
  };
}
