import test from "node:test";
import assert from "node:assert/strict";

import { createInitialApplicationState } from "../../../application/state.js";
import { selectApplicationView } from "../../../application/view-model.js";

// Class-a: with no reference image, the app is the native map plus a Paste
// affordance. Align is impossible because there is no overlay to align.
test("no-session view exposes Trace native-map posture and Paste primary action", () => {
  const view = selectApplicationView(createInitialApplicationState());

  assert.equal(view.mode, "trace");
  assert.equal(view.overlayInput.kind, "native-map");
  assert.equal(view.overlayInput.canEditOverlay, false);
  assert.equal(view.overlayInput.arePinsVisible, false);
  assert.equal(view.modeSwitch.selected, "trace");
  assert.equal(view.modeSwitch.align.enabled, false);
  assert.equal(view.primaryAction.label, "Paste");
  assert.equal(view.primaryAction.enabled, true);
});
