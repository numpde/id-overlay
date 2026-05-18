import test from "node:test";
import assert from "node:assert/strict";

import { createInitialApplicationState } from "../../../application/state.js";
import { selectApplicationView } from "../../../application/view-model.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-a: with no reference image, the app is the native map plus a Paste
// affordance. Align is impossible because there is no overlay to align.
test("no-session view exposes Trace native-map posture and Paste primary action", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "no-session view exposes Trace native-map posture and Paste primary action",
  });
  const view = selectApplicationView(createInitialApplicationState());
  trace.edge(flowEdge("view.application.no-session", "sink.application-view", {
    terminal: "view-result",
  }));

  assert.equal(view.mode, "trace");
  assert.equal(view.panelTitle, "Overlay: no image");
  assert.equal(view.overlayInput.kind, "native-map");
  assert.equal(view.overlayInput.canEditOverlay, false);
  assert.equal(view.overlayInput.arePinsVisible, false);
  assert.equal(view.modeSwitch.selected, "trace");
  assert.equal(view.modeSwitch.align.enabled, false);
  assert.equal(view.modeSwitch.trace.enabled, false);
  assert.deepEqual(view.primaryAction, {
    kind: "request-reference-image",
    label: "Paste",
    enabled: true,
    tone: "normal",
    confirmation: "none",
  });
  assert.deepEqual(view.centerOverlayInViewAction, {
    kind: "center-overlay-in-view",
    label: "Center overlay in view",
    enabled: false,
    icon: "center-overlay",
  });
  assert.deepEqual(trace.edges, [
    flowEdge("view.application.no-session", "sink.application-view", {
      terminal: "view-result",
    }),
  ]);
});
