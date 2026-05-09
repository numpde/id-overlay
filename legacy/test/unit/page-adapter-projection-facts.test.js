import test from "node:test";
import assert from "node:assert/strict";

import {
  createMapProjectionFacts,
  createSnapshotProjectionFacts,
  projectMapPointToBaseScreenPoint,
  unprojectBaseScreenPointToMap,
} from "../../src/content/page-adapter/projection-facts.js";

test("page projection facts derive viewport center and center world once from page facts", () => {
  const projectionFacts = createMapProjectionFacts({
    viewportRect: {
      left: 120,
      top: 80,
      width: 900,
      height: 600,
    },
    mapView: {
      zoom: 16,
      center: {
        lat: -1.22645,
        lon: 36.82597,
      },
    },
  });

  assert.deepEqual(projectionFacts.viewportCenter, { x: 570, y: 380 });
  assert.equal(projectionFacts.mapView.zoom, 16);
  assert.equal(typeof projectionFacts.centerWorld.x, "number");
  assert.equal(typeof projectionFacts.centerWorld.y, "number");
});

test("snapshot projection facts use only the snapshot viewport and map view", () => {
  const snapshot = {
    viewportRect: {
      left: 120,
      top: 80,
      width: 900,
      height: 600,
    },
    localViewportRect: {
      left: 0,
      top: 0,
      width: 900,
      height: 600,
    },
    mapView: {
      zoom: 16,
      center: {
        lat: -1.22645,
        lon: 36.82597,
      },
    },
    surfaceMotion: {
      transformCss: "matrix(1, 0, 0, 1, 10, 20)",
      transformOriginCss: "0px 0px",
    },
  };

  assert.deepEqual(
    createSnapshotProjectionFacts(snapshot),
    createMapProjectionFacts({
      viewportRect: snapshot.viewportRect,
      mapView: snapshot.mapView,
    }),
  );
});

test("page projection facts round-trip map points through base screen space", () => {
  const projectionFacts = createMapProjectionFacts({
    viewportRect: {
      left: 120,
      top: 80,
      width: 900,
      height: 600,
    },
    mapView: {
      zoom: 16,
      center: {
        lat: -1.22645,
        lon: 36.82597,
      },
    },
  });
  const point = {
    lat: -1.2259,
    lon: 36.8271,
  };

  const screenPoint = projectMapPointToBaseScreenPoint({
    projectionFacts,
    point,
  });
  const resolvedPoint = unprojectBaseScreenPointToMap({
    projectionFacts,
    screenPoint,
  });

  assert.ok(Math.abs(resolvedPoint.lat - point.lat) < 1e-9);
  assert.ok(Math.abs(resolvedPoint.lon - point.lon) < 1e-9);
});
