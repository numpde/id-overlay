import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOverlayRenderModel,
  buildPinRenderModels,
  clampOpacity,
  derivePlacementFromScreenTransform,
  createPlacementScreenTransform,
  createSolvedScreenTransform,
  hitTestPin,
  imagePointToScreenPoint,
  projectLatLonToWorld,
  resolveOverlayRenderSource,
  resolveOverlayScreenTransform,
  rotationFromWheelDelta,
  scaleFromWheelDelta,
  screenPointToImagePoint,
  solveSimilarityTransform,
} from "../../src/core/transform.js";

test("clampOpacity keeps opacity in range", () => {
  assert.equal(clampOpacity(-1), 0);
  assert.equal(clampOpacity(0.5), 0.5);
  assert.equal(clampOpacity(2), 1);
});

test("createPlacementScreenTransform maps the image center to the placement center", () => {
  const transform = createPlacementScreenTransform({
    image: { width: 400, height: 200 },
    placement: {
      centerMapLatLon: { lat: 1, lon: 2 },
      scale: 2,
      rotationRad: Math.PI / 2,
    },
    snapshot: {
      viewportRect: { left: 10, top: 20, width: 300, height: 200 },
      mapView: { center: { lat: 0, lon: 0 }, zoom: 16 },
    },
    mapToScreen(point) {
      return { x: point.lon * 10, y: point.lat * 10 };
    },
  });

  assert.deepEqual(
    imagePointToScreenPoint({
      imagePoint: { x: 200, y: 100 },
      transform,
    }),
    { x: 20, y: 10 },
  );
});

test("derivePlacementFromScreenTransform recovers placement fields from a rendered transform", () => {
  const placement = derivePlacementFromScreenTransform({
    image: { width: 400, height: 200 },
    transform: {
      a: 0,
      b: 2,
      tx: 220,
      ty: 10,
    },
    screenToMap(screenPoint) {
      return {
        lat: screenPoint.y / 10,
        lon: screenPoint.x / 10,
      };
    },
  });

  assert.deepEqual(placement.centerMapLatLon, { lat: 41, lon: 2 });
  assert.equal(placement.scale, 2);
  assert.equal(placement.rotationRad, Math.PI / 2);
});

test("resolveOverlayScreenTransform uses solved transforms whenever a clean solve is available", () => {
  const state = {
    mode: "align",
    image: { width: 100, height: 50 },
    opacity: 0.6,
    placement: {
      centerMapLatLon: { lat: 0, lon: 0 },
      scale: 1,
      rotationRad: 0,
    },
    registration: {
      dirty: false,
      solvedTransform: {
        type: "similarity",
        a: 1,
        b: 0,
        tx: 10,
        ty: 20,
      },
    },
  };
  const transform = resolveOverlayScreenTransform({
    state,
    snapshot: {
      viewportRect: { left: 0, top: 0, width: 800, height: 400 },
      mapView: { center: { lat: 0, lon: 0 }, zoom: 0 },
    },
    mapToScreen() {
      throw new Error("placement path should not run");
    },
  });

  assert.deepEqual(transform, createSolvedScreenTransform({
    snapshot: {
      viewportRect: { left: 0, top: 0, width: 800, height: 400 },
      mapView: { center: { lat: 0, lon: 0 }, zoom: 0 },
    },
    solvedTransform: state.registration.solvedTransform,
  }));
});

test("resolveOverlayRenderSource exposes whether rendering uses solved or manual placement", () => {
  assert.equal(resolveOverlayRenderSource({
    image: null,
    mode: "trace",
    registration: { solvedTransform: null, dirty: false },
  }), "none");

  assert.equal(resolveOverlayRenderSource({
    image: { width: 1, height: 1 },
    mode: "trace",
    registration: { solvedTransform: null, dirty: false },
  }), "placement");

  assert.equal(resolveOverlayRenderSource({
    image: { width: 1, height: 1 },
    mode: "align",
    registration: { solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 }, dirty: false },
  }), "solved");

  assert.equal(resolveOverlayRenderSource({
    image: { width: 1, height: 1 },
    mode: "trace",
    registration: { solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 }, dirty: false },
  }), "solved");

  assert.equal(resolveOverlayRenderSource({
    image: { width: 1, height: 1 },
    mode: "trace",
    registration: { solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 }, dirty: true },
  }), "placement");
});

test("buildOverlayRenderModel derives CSS-compatible placement from a similarity transform", () => {
  const model = buildOverlayRenderModel({
    image: { width: 400, height: 200 },
    transform: { a: 0, b: 2, tx: 450, ty: 350 },
    opacity: 0.75,
  });

  assert.equal(model.left, 450);
  assert.equal(model.top, 350);
  assert.equal(model.width, 800);
  assert.equal(model.height, 400);
  assert.equal(model.rotationDeg, 90);
  assert.equal(model.opacity, 0.75);
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

test("buildPinRenderModels and hitTestPin share the same screen geometry", () => {
  const transform = {
    a: 1,
    b: 0,
    tx: 100,
    ty: 50,
  };
  const pins = buildPinRenderModels({
    pins: [
      {
        id: 1,
        imagePx: { x: 20, y: 30 },
        mapLatLon: { lat: 0, lon: 0 },
      },
    ],
    transform,
  });

  assert.deepEqual(pins[0].screenPx, { x: 120, y: 80 });
  assert.equal(
    hitTestPin({
      screenPoint: { x: 123, y: 82 },
      renderedPins: pins,
    })?.id,
    1,
  );
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

test("scaleFromWheelDelta zooms smoothly in and out", () => {
  assert.ok(scaleFromWheelDelta(1, -100) > 1);
  assert.ok(scaleFromWheelDelta(1, 100) < 1);
});

test("rotationFromWheelDelta changes rotation deterministically", () => {
  assert.ok(rotationFromWheelDelta(0, -100) > 0);
  assert.ok(rotationFromWheelDelta(0, 100) < 0);
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
