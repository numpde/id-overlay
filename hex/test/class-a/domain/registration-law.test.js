import test from "node:test";
import assert from "node:assert/strict";

import {
  solveRegistrationPlacement,
} from "../../../domain/registration.js";

// Class-a: two-pin registration is a domain law. Pins are durable image/map
// facts, so solving projects map lat/lon into stable map-world coordinates
// instead of consuming screen, viewport, zoom, or DOM facts.
test("registration solve returns explicit success and failure facts", () => {
  const solved = solveRegistrationPlacement({
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

  assert.deepEqual(solved, {
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
  assert.equal(/\b(screen|viewport|zoom|dom)\b/i.test(JSON.stringify(solved)), false);

  assert.deepEqual(solveRegistrationPlacement({
    pins: [],
  }), {
    kind: "failed",
    reason: "insufficient-pins",
  });

  assert.deepEqual(solveRegistrationPlacement({
    pins: [
      pin({
        id: 1,
        imagePx: {
          x: 0,
          y: 0,
        },
      }),
      pin({
        id: 2,
        imagePx: {
          x: 0,
          y: 0,
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
