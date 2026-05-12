import test from "node:test";
import assert from "node:assert/strict";

import {
  createProjectionAdapter,
} from "../../../adapters/page-osm-id/page-adapter.js";

// Unclassified candidate: projection is not an ambient page query. The caller
// supplies the point and the projection facts being used; the page adapter
// translates those explicit facts or returns an explicit failure.
test("projection adapter passes explicit projection inputs to the page projection service", () => {
  const calls = [];
  const request = {
    screenPx: {
      x: 320,
      y: 240,
    },
    projectionFacts: {
      mapView: {
        zoom: 16,
        centerLatLon: {
          lat: -1.24401,
          lon: 36.82412,
        },
      },
      viewportPx: {
        width: 1280,
        height: 720,
      },
      tileTransform: {
        x: -240,
        y: -180,
        scale: 1,
      },
    },
  };
  const projection = createProjectionAdapter({
    readProjectionContext() {
      return {
        kind: "ready",
        projectScreenPoint(input) {
          calls.push(input);
          return {
            kind: "projected-map-point",
            mapLatLon: {
              lat: -1.25,
              lon: 36.83,
            },
          };
        },
      };
    },
  });

  assert.deepEqual(projection.projectScreenPoint(request), {
    kind: "projected-map-point",
    mapLatLon: {
      lat: -1.25,
      lon: 36.83,
    },
  });
  assert.deepEqual(calls, [request]);
});

// Unclassified candidate: expected projection misses are port data, not nulls
// or thrown control flow. The application can then decide whether the miss is
// user-visible, retryable, or irrelevant.
test("projection adapter preserves unavailable projection reasons as explicit facts", () => {
  const projection = createProjectionAdapter({
    readProjectionContext() {
      return {
        kind: "missing-viewport",
      };
    },
  });

  assert.deepEqual(projection.projectScreenPoint({
    screenPx: {
      x: 320,
      y: 240,
    },
  }), {
    kind: "failed",
    reason: "missing-viewport",
  });
});
