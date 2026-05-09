import test from "node:test";
import assert from "node:assert/strict";

import { selectApplicationView } from "../../../application/view-model.js";

// Class-a: with a loaded reference image, Align and Trace are user-visible
// modes with different interaction ownership. Align edits the overlay; Trace
// restores native map interaction and hides registration pins.
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

function referenceImageLoadedState({ mode }) {
  return {
    session: {
      mode,
      referenceImage: {
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}
