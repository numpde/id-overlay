import test from "node:test";
import assert from "node:assert/strict";

import {
  applySurfaceMotionToScreenPoint,
  createPlacementTransform,
  derivePlacementFromScreenTransform,
  createPlacementScreenTransform,
  imagePointToRenderedScreenPoint,
  imagePointToScreenPoint,
  projectLatLonToWorld,
  removeSurfaceMotionFromScreenPoint,
  screenPointToImagePoint,
  screenPointToRenderedImagePoint,
  solveSimilarityTransform,
} from "../../src/core/transform.js";

test("createPlacementScreenTransform maps the image center to the placement center", () => {
  const snapshot = {
    viewportRect: { left: 10, top: 20, width: 300, height: 200 },
    mapView: { center: { lat: 1, lon: 2 }, zoom: 16 },
  };
  const transform = createPlacementScreenTransform({
    placement: createPlacementTransform({
      image: { width: 400, height: 200 },
      centerMapLatLon: { lat: 1, lon: 2 },
      scale: 2,
      rotationRad: Math.PI / 2,
      zoom: snapshot.mapView.zoom,
    }),
    snapshot,
  });

  const centerScreenPoint = imagePointToScreenPoint({
    imagePoint: { x: 200, y: 100 },
    transform,
  });
  assert.ok(Math.abs(centerScreenPoint.x - 160) < 1e-9);
  assert.ok(Math.abs(centerScreenPoint.y - 120) < 1e-9);
});

test("derivePlacementFromScreenTransform recovers a world-space placement transform from a rendered transform", () => {
  const snapshot = {
    viewportRect: { left: 10, top: 20, width: 300, height: 200 },
    mapView: { center: { lat: 0, lon: 0 }, zoom: 4 },
  };
  const placement = derivePlacementFromScreenTransform({
    snapshot,
    transform: {
      a: 0,
      b: 2,
      tx: 220,
      ty: 10,
    },
  });

  const screenTransform = createPlacementScreenTransform({
    snapshot,
    placement,
  });
  assert.equal(screenTransform.a, 0);
  assert.equal(screenTransform.b, 2);
  assert.equal(screenTransform.tx, 220);
  assert.equal(screenTransform.ty, 10);
});

test("screenPointToImagePoint inverts imagePointToScreenPoint", () => {
  const transform = {
    a: 0.75,
    b: Math.sqrt(3) * 0.75,
    tx: 450,
    ty: 350,
  };
  const imagePoint = { x: 320, y: 180 };
  const screenPoint = imagePointToScreenPoint({
    imagePoint,
    transform,
  });

  const resolved = screenPointToImagePoint({
    screenPoint,
    transform,
  });

  assert.ok(Math.abs(resolved.x - imagePoint.x) < 1e-9);
  assert.ok(Math.abs(resolved.y - imagePoint.y) < 1e-9);
});

test("surface motion helpers are inverse on screen points", () => {
  const snapshot = {
    viewportRect: { left: 100, top: 200, width: 800, height: 400 },
    surfaceMotion: {
      transformCss: "matrix(1, 0, 0, 1, 18, -12)",
      transformOriginCss: "0px 0px",
    },
  };
  const screenPoint = { x: 420, y: 310 };
  const transformed = applySurfaceMotionToScreenPoint({
    screenPoint,
    snapshot,
  });
  assert.deepEqual(transformed, { x: 438, y: 298 });
  const restored = removeSurfaceMotionFromScreenPoint({
    screenPoint: transformed,
    snapshot,
  });
  assert.deepEqual(restored, screenPoint);
});

test("rendered image-point conversion stays aligned with live surface motion", () => {
  const transform = {
    a: 1,
    b: 0,
    tx: 100,
    ty: 50,
  };
  const snapshot = {
    viewportRect: { left: 10, top: 20, width: 300, height: 200 },
    surfaceMotion: {
      transformCss: "matrix(1, 0, 0, 1, 18, -12)",
      transformOriginCss: "0px 0px",
    },
  };
  const imagePoint = { x: 20, y: 30 };
  const renderedScreenPoint = imagePointToRenderedScreenPoint({
    imagePoint,
    transform,
    snapshot,
  });
  assert.deepEqual(renderedScreenPoint, { x: 138, y: 68 });
  const restoredImagePoint = screenPointToRenderedImagePoint({
    screenPoint: renderedScreenPoint,
    transform,
    snapshot,
  });
  assert.deepEqual(restoredImagePoint, imagePoint);
});

test("solveSimilarityTransform recovers a clean two-pin similarity fit", () => {
  const pins = [
    {
      id: 1,
      imagePx: { x: 0, y: 0 },
      mapLatLon: worldToLatLon({ x: 100, y: 200 }),
    },
    {
      id: 2,
      imagePx: { x: 10, y: 0 },
      mapLatLon: worldToLatLon({ x: 120, y: 200 }),
    },
  ];

  const transform = solveSimilarityTransform(pins);
  assert.ok(transform);
  assert.equal(transform.type, "similarity");
  assert.ok(Math.abs(transform.a - 2) < 1e-9);
  assert.ok(Math.abs(transform.b - 0) < 1e-9);
  assert.ok(Math.abs(transform.tx - 100) < 1e-9);
  assert.ok(Math.abs(transform.ty - 200) < 1e-9);
});

function worldToLatLon(world) {
  const lon = (world.x / 256) * 360 - 180;
  const mercatorY = (0.5 - world.y / 256) * 2 * Math.PI;
  const lat = (Math.atan(Math.sinh(mercatorY)) * 180) / Math.PI;
  return { lat, lon };
}

test("projectLatLonToWorld is stable for round-trippable test coordinates", () => {
  const point = { lat: -1.23, lon: 36.84 };
  const world = projectLatLonToWorld(point);
  assert.ok(Number.isFinite(world.x));
  assert.ok(Number.isFinite(world.y));
});
