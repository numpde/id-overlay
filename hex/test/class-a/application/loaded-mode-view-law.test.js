import test from "node:test";
import assert from "node:assert/strict";

import { selectApplicationView } from "../../../application/view-model.js";

// Class-a: with a loaded reference image, Align and Trace are user-visible
// modes with different interaction ownership. Align edits the overlay; Trace
// restores native map interaction and hides registration pins.
test("loaded image view derives Align editing and Trace pass-through policies", () => {
  const pin = firstPin();

  assert.deepEqual(selectApplicationView(referenceImageLoadedState({
    mode: "align",
    pins: [pin],
  })).overlayInput, {
    kind: "overlay-editing",
    canEditOverlay: true,
    arePinsVisible: true,
  });
  assert.deepEqual(selectApplicationView(referenceImageLoadedState({
    mode: "align",
    pins: [pin],
  })).overlay.pins, [pin]);

  assert.deepEqual(selectApplicationView(referenceImageLoadedState({
    mode: "trace",
    pins: [pin],
  })).overlayInput, {
    kind: "native-map",
    canEditOverlay: false,
    arePinsVisible: false,
  });
  assert.deepEqual(selectApplicationView(referenceImageLoadedState({
    mode: "trace",
    pins: [pin],
  })).overlay.pins, []);
});

function referenceImageLoadedState({ mode, pins = [] }) {
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
