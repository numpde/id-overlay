import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPlacementToPoint,
  invertPlacement,
} from "../../../domain/placement.js";

// Class-b: placement is pure geometry. A transform must be reversible without
// leaking host-runtime or map-runtime concepts inward.
test("placement transform round-trips through its inverse", () => {
  const point = {
    x: 12.5,
    y: -3.25,
  };
  const placement = {
    x: 42,
    y: -17,
    scale: 1.75,
    rotationRad: Math.PI / 6,
  };

  const transformed = applyPlacementToPoint(point, placement);
  const roundTripped = applyPlacementToPoint(
    transformed,
    invertPlacement(placement),
  );

  assertPointClose(roundTripped, point);
});

function assertPointClose(actual, expected) {
  assert.equal(Math.abs(actual.x - expected.x) < 1e-9, true);
  assert.equal(Math.abs(actual.y - expected.y) < 1e-9, true);
}
