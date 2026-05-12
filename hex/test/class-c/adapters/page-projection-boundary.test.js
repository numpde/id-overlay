import test from "node:test";
import assert from "node:assert/strict";

import {
  createProjectionAdapter,
} from "../../../adapters/page-osm-id/page-adapter.js";

// Class-c: projection should be deterministic over explicit input facts, not
// an ambient page query hidden behind `context.project()`. Current code does
// not satisfy this yet, so the test stays quarantined until projection is split
// from page observation and given a clear input contract.
//
// Decision: keep only the unsatisfied explicit-input pressure. Explicit
// projection misses are already covered in class-b, so duplicating them here
// would make class-c noisier without adding design signal.
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
