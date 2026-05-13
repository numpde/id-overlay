import test from "node:test";
import assert from "node:assert/strict";

import {
  solveRegistrationPlacement,
} from "../../../domain/registration.js";

// Unclassified candidate: serious alternative to current class-a registration law. This says
// pins are durable image/map facts, so the solver should consume `mapLatLon`
// and produce a stable image-to-map-world transform. Current class-a law solves
// from projected `mapPx` into a placement, so this cannot be promoted locally.
//
// Decision: keep unclassified until the registration model is deliberately
// re-opened. If promoted, it replaces the class-a solver contract rather than
// merely extending it.
test("registration solve returns a stable image-to-map-world transform", () => {
  const result = solveRegistrationPlacement({
    pins: [
      pin({
        id: 1,
        imagePx: {
          x: 0,
          y: 0,
        },
        mapLatLon: {
          lat: 0,
          lon: -180,
        },
      }),
      pin({
        id: 2,
        imagePx: {
          x: 100,
          y: 0,
        },
        mapLatLon: {
          lat: 0,
          lon: -178.59375,
        },
      }),
    ],
  });

  assert.deepEqual(result, {
    kind: "solved",
    solvedTransform: {
      type: "image-to-map-world",
      a: 0.01,
      b: 0,
      tx: 0,
      ty: 128,
      scale: 0.01,
      rotationRad: 0,
      pinIds: [1, 2],
    },
  });
  assert.equal(/\b(screen|viewport|zoom|dom|browser)\b/i.test(JSON.stringify(result)), false);
});

// Unclassified candidate: explicit failure is already class-a; this version additionally
// includes pin ids and belongs to the alternate transform contract.
test("registration solve failure is explicit source-neutral data", () => {
  assert.deepEqual(solveRegistrationPlacement({
    pins: [
      pin({
        id: 1,
        imagePx: {
          x: 10,
          y: 10,
        },
      }),
      pin({
        id: 2,
        imagePx: {
          x: 10,
          y: 10,
        },
      }),
    ],
  }), {
    kind: "failed",
    reason: "degenerate-pins",
    pinIds: [1, 2],
  });
});

function pin({
  id,
  imagePx,
  mapLatLon = {
    lat: 0,
    lon: -180,
  },
}) {
  return {
    id,
    imagePx,
    mapLatLon,
  };
}
