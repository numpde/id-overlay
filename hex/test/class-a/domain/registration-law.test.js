import test from "node:test";
import assert from "node:assert/strict";

import {
  solveRegistrationPlacement,
} from "../../../domain/registration.js";

// Class-a: two-pin registration is a domain law. A solvable pin pair yields the
// similarity transform that maps image points into map points, while expected
// geometric impossibilities are explicit facts rather than thrown control flow.
test("registration solve returns explicit success and failure facts", () => {
  assert.deepEqual(solveRegistrationPlacement({
    pins: [
      {
        imagePx: {
          x: 0,
          y: 0,
        },
        mapPx: {
          x: 100,
          y: 200,
        },
      },
      {
        imagePx: {
          x: 100,
          y: 0,
        },
        mapPx: {
          x: 200,
          y: 200,
        },
      },
    ],
  }), {
    kind: "solved",
    placement: {
      x: 100,
      y: 200,
      scale: 1,
      rotationRad: 0,
    },
  });

  assert.deepEqual(solveRegistrationPlacement({
    pins: [],
  }), {
    kind: "failed",
    reason: "insufficient-pins",
  });

  assert.deepEqual(solveRegistrationPlacement({
    pins: [
      {
        imagePx: {
          x: 0,
          y: 0,
        },
        mapPx: {
          x: 100,
          y: 200,
        },
      },
      {
        imagePx: {
          x: 0,
          y: 0,
        },
        mapPx: {
          x: 200,
          y: 200,
        },
      },
    ],
  }), {
    kind: "failed",
    reason: "degenerate-pins",
  });
});
