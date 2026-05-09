import test from "node:test";
import assert from "node:assert/strict";

import {
  resolvePanelPosition,
} from "../../../adapters/ui/panel-position-adapter.js";

// Class-b: panel position is adapter-local chrome, but persisted/restored
// coordinates must be normalized at the UI boundary so a user cannot strand the
// panel offscreen across reloads.
test("panel position adapter clamps finite panel coordinates to viewport", () => {
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
