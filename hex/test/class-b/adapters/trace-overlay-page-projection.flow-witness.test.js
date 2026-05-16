import test from "node:test";
import assert from "node:assert/strict";

import {
  projectTraceOverlayForPageSnapshot,
} from "../../../adapters/ui/trace-overlay-page-projection.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: Trace overlay rendering is page-observed UI projection. The render
// source is a map-locked placement regardless of whether pins or hand placement
// authored it; the rendered screen placement follows the current page snapshot
// without writing a new durable placement.
test("trace overlay projection follows the current page snapshot", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "trace overlay projection follows the current page snapshot",
  });
  const overlay = traceOverlayView();

  assert.deepEqual(projectTraceOverlayForPageSnapshot({
    overlay,
    pageSnapshot: traceSnapshot(),
  }), {
    ...overlay,
    viewport: traceViewport(),
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
    viewport: traceViewport(),
    placement: {
      x: 371.2888888888889,
      y: 272,
      scale: 1,
      rotationRad: 0,
    },
    pins: [],
    pageSurfaceMotion: activeSurfaceMotion(),
  });
  assert.deepEqual(overlay.placement, mapLockedPlacement());
  trace.edge(flowEdge("view.overlay", "sink.overlay-projection", {
    terminal: "adapter-result",
  }));
});

// Class-b: live OSM surface motion is a render-time page fact. Trace projection
// must carry it to the renderer without rewriting the durable map-locked
// placement, so a moving map surface and a later settled map snapshot can both
// be rendered from the same placement data.
test("trace overlay projection carries live surface motion without mutating overlay facts", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "trace overlay projection carries live surface motion without mutating overlay facts",
  });
  const overlay = traceOverlayView();

  const moving = projectTraceOverlayForPageSnapshot({
    overlay,
    pageSnapshot: traceSnapshot({
      surfaceMotion: activeSurfaceMotion(),
    }),
  });
  const settled = projectTraceOverlayForPageSnapshot({
    overlay,
    pageSnapshot: traceSnapshot({
      centerLon: 1,
      surfaceMotion: inertSurfaceMotion(),
    }),
  });

  assert.deepEqual(moving.pageSurfaceMotion, activeSurfaceMotion());
  assert.deepEqual(settled.pageSurfaceMotion, inertSurfaceMotion());
  assert.notDeepEqual(moving.placement, settled.placement);
  assert.deepEqual(moving.viewport, traceViewport());
  assert.deepEqual(settled.viewport, traceViewport());
  assert.deepEqual(overlay.placement, mapLockedPlacement());
  assert.equal(overlay.pageSurfaceMotion, undefined);
  trace.edge(flowEdge("view.overlay", "sink.overlay-projection", {
    phase: "live-surface-motion",
    terminal: "adapter-result",
  }));
  trace.edge(flowEdge("view.overlay", "sink.overlay-projection", {
    phase: "settled-map-view",
    terminal: "adapter-result",
  }));
});

// Class-b: legacy Trace rendering anchored solved overlays to the live map
// viewport, not the extension's full browser window. Embedded editor offsets
// and in-flight surface motion are both page facts that must cross the
// projection boundary.
test("trace overlay projection uses viewport screen origin and live surface motion", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "trace overlay projection uses viewport screen origin and live surface motion",
  });
  const overlay = traceOverlayView();

  const projected = projectTraceOverlayForPageSnapshot({
    overlay,
    pageSnapshot: traceSnapshot({
      viewportScreenPx: {
        x: 320,
        y: 70,
      },
      viewportPx: {
        width: 700,
        height: 500,
      },
      surfaceMotion: activeSurfaceMotion(),
    }),
  });

  assert.deepEqual(projected.placement, {
    x: 322,
    y: 322,
    scale: 1,
    rotationRad: 0,
  });
  assert.deepEqual(projected.viewport, traceViewport({
    left: 320,
    top: 70,
    width: 700,
    height: 500,
  }));
  assert.deepEqual(projected.pageSurfaceMotion, activeSurfaceMotion());
  assert.deepEqual(overlay.placement, mapLockedPlacement());
  trace.edge(flowEdge("view.overlay", "sink.overlay-projection", {
    phase: "viewport-origin-and-surface-motion",
    terminal: "adapter-result",
  }));
});

// Class-b: Trace mode stays locked to the live map surface even before the user
// has added registration pins. Hand-authored and pin-authored placement both
// cross the same map-locked projection boundary.
test("trace overlay projection maps hand placement through the same map lock", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "trace overlay projection maps hand placement through the same map lock",
  });
  const placement = {
    x: 100,
    y: 200,
    scale: 1.25,
    rotationRad: 0.1,
  };
  const overlay = {
    visible: true,
    imageDataRef: "reference-image-data-2",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
    placement,
    opacity: 0.8,
    pins: [],
    pageProjectionSource: {
      kind: "map-locked-placement",
    },
  };

  const projected = projectTraceOverlayForPageSnapshot({
    overlay,
    pageSnapshot: traceSnapshot({
      surfaceMotion: activeSurfaceMotion(),
    }),
  });

  assert.deepEqual(projected, {
    ...overlay,
    viewport: traceViewport(),
    placement: {
      x: 372,
      y: 272,
      scale: 1.25,
      rotationRad: 0.1,
    },
    pins: [],
    pageSurfaceMotion: activeSurfaceMotion(),
  });
  assert.deepEqual(projectTraceOverlayForPageSnapshot({
    overlay,
    pageSnapshot: traceSnapshot({
      centerLon: 1,
    }),
  }).placement, {
    x: 371.2888888888889,
    y: 272,
    scale: 1.25,
    rotationRad: 0.1,
  });
  assert.equal(overlay.pageSurfaceMotion, undefined);
  trace.edge(flowEdge("view.overlay", "sink.overlay-projection", {
    phase: "hand-placement-map-lock",
    terminal: "adapter-result",
  }));
});

// Class-b: page projection is coordinate-space work, not Trace-only UI policy.
// Align keeps overlay input and pins, but a map-locked Align placement still
// renders through the live map snapshot so map pan/zoom moves the image.
test("trace overlay projection preserves Align editing while projecting map-locked placement", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "trace overlay projection preserves Align editing while projecting map-locked placement",
  });
  const overlay = {
    ...traceOverlayView(),
    pins: [{
      id: 1,
      imagePx: {
        x: 10,
        y: 15,
      },
    }],
    pageProjectionSource: {
      kind: "map-locked-placement",
      mode: "align",
    },
  };

  const projected = projectTraceOverlayForPageSnapshot({
    overlay,
    pageSnapshot: traceSnapshot({
      viewportScreenPx: {
        x: 320,
        y: 70,
      },
      viewportPx: {
        width: 700,
        height: 500,
      },
      centerLon: 1,
      surfaceMotion: activeSurfaceMotion(),
    }),
  });

  assert.deepEqual(projected.viewport, traceViewport({
    left: 320,
    top: 70,
    width: 700,
    height: 500,
    mode: "align",
    isPassThrough: false,
  }));
  assert.deepEqual(projected.placement, {
    x: 321.2888888888889,
    y: 322,
    scale: 1,
    rotationRad: 0,
  });
  assert.deepEqual(projected.pins, overlay.pins);
  assert.deepEqual(projected.pageSurfaceMotion, activeSurfaceMotion());
  trace.edge(flowEdge("view.overlay", "sink.overlay-projection", {
    phase: "align-map-locked-placement",
    terminal: "adapter-result",
  }));
});

// Class-b: page observation can be temporarily unavailable while the editor is
// booting or navigating. A map-locked Trace placement must never be returned as
// raw screen placement; world-coordinate scale and translation would otherwise
// collapse the DOM overlay to sub-pixel size.
test("trace overlay projection hides map-locked overlay without map view", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "trace overlay projection hides map-locked overlay without map view",
  });
  const overlay = traceOverlayView();

  assert.deepEqual(projectTraceOverlayForPageSnapshot({
    overlay,
    pageSnapshot: {
      kind: "supported-map-page",
      mapView: null,
      viewportPx: {
        width: 800,
        height: 400,
      },
      surfaceMotion: activeSurfaceMotion(),
    },
  }), {
    ...overlay,
    visible: false,
    placement: null,
    pins: [],
    pageProjectionFailure: {
      reason: "missing-projectable-map-view",
    },
  });
  trace.edge(flowEdge("view.overlay", "sink.overlay-projection", {
    phase: "missing-map-view",
    terminal: "adapter-result",
  }));
});

function traceOverlayView() {
  return {
    visible: true,
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 100,
      height: 50,
    },
    placement: mapLockedPlacement(),
    opacity: 1,
    pins: [{
      id: 1,
      imagePx: {
        x: 10,
        y: 15,
      },
    }],
    pageProjectionSource: {
      kind: "map-locked-placement",
    },
  };
}

function mapLockedPlacement() {
  return {
    x: 100,
    y: 200,
    scale: 1,
    rotationRad: 0,
  };
}

function traceSnapshot({
  centerLon = 0,
  viewportPx = {
    width: 800,
    height: 400,
  },
  viewportScreenPx = {
    x: 0,
    y: 0,
  },
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
    viewportPx,
    viewportScreenPx,
    surfaceMotion,
  };
}

function traceViewport({
  left = 0,
  top = 0,
  width = 800,
  height = 400,
  mode = "trace",
  isPassThrough = true,
} = {}) {
  return {
    mode,
    isPassThrough,
    rect: {
      left,
      top,
      width,
      height,
    },
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
