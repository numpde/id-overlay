import test from "node:test";
import assert from "node:assert/strict";

import { selectApplicationView } from "../../../application/view-model.js";

// Candidate: overlay rendering should be a pure projection from state. The
// adapter needs concrete facts, not permission to inspect session internals.
test("view model exposes overlay render facts", () => {
  const placement = {
    x: 80,
    y: 40,
    scale: 1.5,
    rotationRad: 0.2,
  };

  assert.deepEqual(selectApplicationView(referenceImageLoadedState({
    placement,
    opacity: 0.6,
    pins: [firstPin()],
  })).overlay, {
    visible: true,
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
    placement,
    opacity: 0.6,
    pins: [firstPin()],
  });
});

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
  placement,
  opacity,
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
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
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
