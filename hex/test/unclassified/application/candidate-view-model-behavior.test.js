import test from "node:test";
import assert from "node:assert/strict";

import { selectApplicationView } from "../../../application/view-model.js";

// Candidate: temporary pass-through is not a durable mode. It should override
// interaction ownership in the view while leaving the saved session mode alone.
test("view model exposes temporary pass-through as interaction posture", () => {
  assert.deepEqual(selectApplicationView({
    ...referenceImageLoadedState({
      mode: "align",
      pins: [firstPin()],
    }),
    inputOverride: {
      kind: "temporary-pass-through",
    },
  }).overlayInput, {
    kind: "native-map",
    canEditOverlay: false,
    arePinsVisible: false,
    reason: "temporary-pass-through",
  });
});

function referenceImageLoadedState({
  mode = "align",
  pins = [],
  panelIntent = null,
} = {}) {
  const session = {
    mode,
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
  if (pins.length > 0) {
    session.registration = {
      pins,
    };
  }
  return {
    session,
    ...(panelIntent === null ? {} : { panelIntent }),
  };
}

function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  };
}
