import test from "node:test";
import assert from "node:assert/strict";

import {
  selectApplicationView,
} from "../../../application/view-model.js";

// Unclassified candidate: this proposes the map-world registration presentation boundary, not
// current application law. Today registration solve metadata is represented as
// `solvedPlacement`; this candidate uses stale `registration.fit` vocabulary and
// a future transform shape.
//
// Decision: keep unclassified. The "no screen/viewport facts in the app view"
// pressure is useful, but the solve model must be settled before this can
// become a stable view-model contract.
test("application view exposes solved registration without screen placement", () => {
  const view = selectApplicationView({
    session: {
      mode: "trace",
      referenceImage: normalizedReferenceImage(),
      registration: {
        pins: [firstPin(), secondPin()],
        fit: {
          kind: "from-pins",
          pinIds: [1, 2],
        },
      },
    },
  });

  assert.deepEqual(view.overlay, {
    visible: true,
    imageDataRef: normalizedReferenceImage().imageDataRef,
    intrinsicSizePx: normalizedReferenceImage().intrinsicSizePx,
    placement: null,
    registrationFit: {
      kind: "solved",
      pinIds: [1, 2],
      transform: solvedTransform(),
    },
    opacity: 1,
    pins: [],
  });
  assert.equal(JSON.stringify(view.overlay).includes("screenPx"), false);
  assert.equal(JSON.stringify(view.overlay).includes("viewport"), false);
});

function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 0,
      y: 0,
    },
    mapLatLon: {
      lat: 0,
      lon: -180,
    },
  };
}

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 100,
      y: 0,
    },
    mapLatLon: {
      lat: 0,
      lon: -178.59375,
    },
  };
}

function solvedTransform() {
  return {
    type: "image-to-map-world",
    a: 0.01,
    b: 0,
    tx: 0,
    ty: 128,
    scale: 0.01,
    rotationRad: 0,
    pinIds: [1, 2],
  };
}
