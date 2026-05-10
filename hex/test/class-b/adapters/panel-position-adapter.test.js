import test from "node:test";
import assert from "node:assert/strict";

import {
  resolvePanelPosition,
} from "../../../adapters/ui/panel-position-adapter.js";

// Class-b, deliberately not class-a: panel position is adapter-local chrome,
// not product state. The UI boundary still normalizes persisted/restored
// coordinates so a user cannot strand the panel offscreen across reloads.
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
