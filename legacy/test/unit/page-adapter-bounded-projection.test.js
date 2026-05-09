import test from "node:test";
import assert from "node:assert/strict";

import {
  createBoundedPageProjection,
} from "../../src/content/page-adapter/bounded-projection.js";

test("bounded page projection delegates projection methods through named boundary operations", () => {
  const calls = [];
  const projection = createProjectionStub({
    clientPointToScreen: { x: 11, y: 12 },
    screenPointToClient: { x: 21, y: 22 },
    mapToScreen: { x: 31, y: 32 },
    mapToOverlayLayerScreen: { x: 41, y: 42 },
    screenToMap: { lat: -1.2, lon: 36.8 },
  });
  const boundedProjection = createBoundedPageProjection({
    projection,
    getFallbackMapView: () => ({ center: { lat: 0, lon: 0 } }),
    runBoundary(operation, fn) {
      calls.push(operation);
      return {
        ok: true,
        value: fn(),
      };
    },
  });

  assert.deepEqual(boundedProjection.clientPointToScreen({ x: 1, y: 2 }), { x: 11, y: 12 });
  assert.deepEqual(boundedProjection.screenPointToClient({ x: 3, y: 4 }), { x: 21, y: 22 });
  assert.deepEqual(boundedProjection.mapToScreen({ lat: 5, lon: 6 }), { x: 31, y: 32 });
  assert.deepEqual(boundedProjection.mapToOverlayLayerScreen({ lat: 7, lon: 8 }), { x: 41, y: 42 });
  assert.deepEqual(boundedProjection.screenToMap({ x: 9, y: 10 }), { lat: -1.2, lon: 36.8 });
  assert.deepEqual(calls, [
    "client-point-to-screen",
    "screen-point-to-client",
    "map-to-screen",
    "map-to-overlay-layer-screen",
    "screen-to-map",
  ]);
});

test("bounded page projection centralizes projection fallback values", () => {
  const fallbackCenter = { lat: -1.2, lon: 36.8 };
  const boundedProjection = createBoundedPageProjection({
    projection: createProjectionStub(),
    getFallbackMapView: () => ({ center: fallbackCenter }),
    runBoundary() {
      return { ok: false };
    },
  });

  assert.deepEqual(boundedProjection.clientPointToScreen({ x: 1, y: 2 }), { x: 1, y: 2 });
  assert.deepEqual(boundedProjection.clientPointToScreen(null), { x: 0, y: 0 });
  assert.deepEqual(boundedProjection.screenPointToClient({ x: 3, y: 4 }), { x: 3, y: 4 });
  assert.deepEqual(boundedProjection.mapToScreen({ lat: 5, lon: 6 }), { x: 0, y: 0 });
  assert.deepEqual(boundedProjection.mapToOverlayLayerScreen({ lat: 7, lon: 8 }), { x: 0, y: 0 });
  assert.equal(boundedProjection.screenToMap({ x: 9, y: 10 }), fallbackCenter);
});

function createProjectionStub(results = {}) {
  return {
    clientPointToScreen() {
      return results.clientPointToScreen;
    },
    screenPointToClient() {
      return results.screenPointToClient;
    },
    mapToScreen() {
      return results.mapToScreen;
    },
    mapToOverlayLayerScreen() {
      return results.mapToOverlayLayerScreen;
    },
    screenToMap() {
      return results.screenToMap;
    },
  };
}
