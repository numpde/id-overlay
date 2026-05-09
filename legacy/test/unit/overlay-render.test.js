import test from "node:test";
import assert from "node:assert/strict";

import {
  createPlacementTransform,
  createSolvedScreenTransform,
} from "../../src/core/transform.js";
import {
  buildOverlayRenderModel,
  resolveOverlayRenderSource,
  resolveOverlayRenderState,
  resolveOverlayScreenTransform,
} from "../../src/core/overlay-render.js";

test("resolveOverlayScreenTransform uses solved transforms whenever a clean solve is available", () => {
  const state = {
    image: { width: 100, height: 50 },
    opacity: 0.6,
    placement: createPlacementTransform({
      image: { width: 100, height: 50 },
      centerMapLatLon: { lat: 0, lon: 0 },
      scale: 1,
      rotationRad: 0,
      zoom: 0,
    }),
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
    registration: { solvedTransform: null, dirty: false },
  }), "none");

  assert.equal(resolveOverlayRenderSource({
    image: { width: 1, height: 1 },
    registration: { solvedTransform: null, dirty: false },
  }), "placement");

  assert.equal(resolveOverlayRenderSource({
    image: { width: 1, height: 1 },
    registration: { solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 }, dirty: false },
  }), "solved");

  assert.equal(resolveOverlayRenderSource({
    image: { width: 1, height: 1 },
    registration: { solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 }, dirty: false },
  }), "solved");

  assert.equal(resolveOverlayRenderSource({
    image: { width: 1, height: 1 },
    registration: { solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 }, dirty: true },
  }), "placement");
});

test("resolveOverlayRenderState centralizes the active render source and transform", () => {
  assert.deepEqual(resolveOverlayRenderState({
    image: null,
    placement: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 },
    registration: { solvedTransform: { type: "similarity", a: 2, b: 0, tx: 3, ty: 4 }, dirty: false },
  }), {
    source: "none",
    similarityTransform: null,
  });

  const placement = { type: "similarity", a: 1, b: 0, tx: 5, ty: 6 };
  assert.deepEqual(resolveOverlayRenderState({
    image: { width: 1, height: 1 },
    placement,
    registration: { solvedTransform: { type: "similarity", a: 2, b: 0, tx: 3, ty: 4 }, dirty: true },
  }), {
    source: "placement",
    similarityTransform: placement,
  });

  const solvedTransform = { type: "similarity", a: 2, b: 0, tx: 3, ty: 4 };
  assert.deepEqual(resolveOverlayRenderState({
    image: { width: 1, height: 1 },
    placement,
    registration: { solvedTransform, dirty: false },
  }), {
    source: "solved",
    similarityTransform: solvedTransform,
  });
});

test("resolveOverlayRenderState prefers machine-owned placement preview when present", () => {
  const placement = { type: "similarity", a: 1, b: 0, tx: 5, ty: 6 };
  const solvedTransform = { type: "similarity", a: 2, b: 0, tx: 3, ty: 4 };
  const previewPlacement = { type: "similarity", a: 1, b: 0, tx: 25, ty: 16 };

  assert.deepEqual(resolveOverlayRenderState({
    session: {
      image: { width: 1, height: 1 },
      placement,
      registration: { solvedTransform, dirty: false },
    },
    runtime: {
      placementEdit: {
        kind: "move",
        beforePlacement: solvedTransform,
        beforeRegistration: { pins: [], solvedTransform, dirty: false },
        previewPlacement,
      },
    },
  }), {
    source: "placement-preview",
    similarityTransform: previewPlacement,
  });
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
