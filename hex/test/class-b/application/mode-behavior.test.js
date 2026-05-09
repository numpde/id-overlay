import test from "node:test";
import assert from "node:assert/strict";

import { selectApplicationView } from "../../../application/view-model.js";
import {
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b: Align is overlay-editing posture and Trace is native-map posture
// once an image exists. The policy is stable; exact view-model keys are still
// application API shape.
test("loaded image view derives Align editing and Trace pass-through policies", () => {
  assert.deepEqual(selectApplicationView(referenceImageLoadedState({
    mode: "align",
  })).overlayInput, {
    kind: "overlay-editing",
    canEditOverlay: true,
    arePinsVisible: true,
  });

  assert.deepEqual(selectApplicationView(referenceImageLoadedState({
    mode: "trace",
  })).overlayInput, {
    kind: "native-map",
    canEditOverlay: false,
    arePinsVisible: false,
  });
});
