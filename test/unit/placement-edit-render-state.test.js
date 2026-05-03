import test from "node:test";
import assert from "node:assert/strict";

import { resolvePlacementEditRenderState } from "../../src/core/placement-edit-render-state.js";

const IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 100,
  height: 50,
});

const PIN_1 = Object.freeze({
  id: 1,
  imagePx: Object.freeze({ x: 10, y: 20 }),
  mapLatLon: Object.freeze({ lat: 1, lon: 2 }),
});

const PIN_2 = Object.freeze({
  id: 2,
  imagePx: Object.freeze({ x: 30, y: 40 }),
  mapLatLon: Object.freeze({ lat: 3, lon: 4 }),
});

const PLACEMENT = Object.freeze({
  type: "similarity",
  a: 1,
  b: 0,
  tx: 10,
  ty: 20,
  scale: 1,
  rotationRad: 0,
});

const SOLVED_TRANSFORM = Object.freeze({
  type: "similarity",
  a: 2,
  b: 0,
  tx: 410,
  ty: 210,
  scale: 2,
  rotationRad: 0,
  pinCount: 2,
});

const SOLVED_PLACEMENT = Object.freeze({
  type: "similarity",
  a: SOLVED_TRANSFORM.a,
  b: SOLVED_TRANSFORM.b,
  tx: SOLVED_TRANSFORM.tx,
  ty: SOLVED_TRANSFORM.ty,
  scale: SOLVED_TRANSFORM.scale,
  rotationRad: SOLVED_TRANSFORM.rotationRad,
});

const SNAPSHOT = Object.freeze({
  viewportRect: Object.freeze({ left: 0, top: 0, width: 800, height: 400 }),
  mapView: Object.freeze({ center: Object.freeze({ lat: 0, lon: 0 }), zoom: 0 }),
});

test("placement edit render state prefers the machine preview placement", () => {
  const previewPlacement = { ...PLACEMENT, tx: 30, ty: 40 };
  const result = resolvePlacementEditRenderState({
    state: {
      session: createSolvedSession(),
      runtime: {
        placementEdit: {
          previewPlacement,
        },
      },
    },
    snapshot: SNAPSHOT,
  });

  assert.equal(result.placement, previewPlacement);
  assert.deepEqual(result.registration, {
    pins: [PIN_1, PIN_2],
    solvedTransform: SOLVED_TRANSFORM,
    dirty: true,
  });
});

test("placement edit render state derives placement from the solved render state", () => {
  const result = resolvePlacementEditRenderState({
    state: createSolvedSession(),
    snapshot: SNAPSHOT,
  });

  assert.deepEqual(result.placement, SOLVED_PLACEMENT);
  assert.deepEqual(result.registration, {
    pins: [PIN_1, PIN_2],
    solvedTransform: SOLVED_TRANSFORM,
    dirty: true,
  });
});

test("placement edit render state falls back to durable placement and rejects missing placement", () => {
  const session = {
    image: IMAGE,
    placement: PLACEMENT,
    registration: {
      pins: [PIN_1, PIN_2],
      solvedTransform: SOLVED_TRANSFORM,
      dirty: true,
    },
  };

  assert.equal(
    resolvePlacementEditRenderState({
      state: session,
      snapshot: SNAPSHOT,
    }).placement,
    PLACEMENT,
  );
  assert.equal(
    resolvePlacementEditRenderState({
      state: {
        ...session,
        placement: null,
      },
      snapshot: SNAPSHOT,
    }),
    null,
  );
});

function createSolvedSession() {
  return {
    image: IMAGE,
    placement: PLACEMENT,
    registration: {
      pins: [PIN_1, PIN_2],
      solvedTransform: SOLVED_TRANSFORM,
      dirty: false,
    },
  };
}
