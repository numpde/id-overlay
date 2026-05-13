import test from "node:test";
import assert from "node:assert/strict";

import {
  projectTraceOverlayForPageSnapshot,
} from "../../../adapters/ui/trace-overlay-page-projection.js";

// Class-b: Trace overlay rendering is page-observed UI projection. A solved
// registration is stored as browser-neutral image-to-map-world data; the
// rendered overlay placement follows the current page snapshot without writing
// a new durable placement.
test("trace overlay projection follows the current page snapshot", () => {
  const overlay = traceOverlayView();

  assert.deepEqual(projectTraceOverlayForPageSnapshot({
    overlay,
    pageSnapshot: traceSnapshot(),
  }), {
    ...overlay,
    placement: {
      x: 372,
      y: 272,
      scale: 1,
      rotationRad: 0,
    },
    pins: [],
    pageSurfaceMotion: traceSnapshot().surfaceMotion,
  });

  assert.deepEqual(projectTraceOverlayForPageSnapshot({
    overlay,
    pageSnapshot: traceSnapshot({
      centerLon: 1,
      surfaceMotion: activeSurfaceMotion(),
    }),
  }), {
    ...overlay,
    placement: {
      x: 371.2888888888889,
      y: 272,
      scale: 1,
      rotationRad: 0,
    },
    pins: [],
    pageSurfaceMotion: activeSurfaceMotion(),
  });
  assert.equal(overlay.placement, null);
});

function traceOverlayView() {
  return {
    visible: true,
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 100,
      height: 50,
    },
    placement: null,
    opacity: 1,
    pins: [{
      id: 1,
      imagePx: {
        x: 10,
        y: 15,
      },
    }],
    pageProjectionSource: {
      kind: "image-to-map-world-transform",
      transform: imageToMapWorldTransform(),
    },
  };
}

function imageToMapWorldTransform() {
  return {
    type: "image-to-map-world",
    a: 1,
    b: 0,
    tx: 100,
    ty: 200,
    scale: 1,
    rotationRad: 0,
    pinIds: [1, 2],
  };
}

function traceSnapshot({
  centerLon = 0,
  surfaceMotion = inertSurfaceMotion(),
} = {}) {
  return {
    kind: "supported-map-page",
    mapView: {
      zoom: 0,
      centerLatLon: {
        lat: 0,
        lon: centerLon,
      },
    },
    viewportPx: {
      width: 800,
      height: 400,
    },
    viewportScreenPx: {
      x: 0,
      y: 0,
    },
    surfaceMotion,
  };
}

function inertSurfaceMotion() {
  return {
    transformCss: "none",
    transformOriginCss: "0px 0px",
  };
}

function activeSurfaceMotion() {
  return {
    transformCss: "matrix(1, 0, 0, 1, 18, -12)",
    transformOriginCss: "0px 0px",
  };
}
