import test from "node:test";
import assert from "node:assert/strict";

import {
  rotationFromWheelDelta,
  scaleFromWheelDelta,
} from "../../src/core/wheel-adjustment.js";

test("scaleFromWheelDelta zooms smoothly in and out", () => {
  assert.ok(scaleFromWheelDelta(1, -100) > 1);
  assert.ok(scaleFromWheelDelta(1, 100) < 1);
});

test("rotationFromWheelDelta changes rotation deterministically", () => {
  assert.ok(rotationFromWheelDelta(0, -100) > 0);
  assert.ok(rotationFromWheelDelta(0, 100) < 0);
});
