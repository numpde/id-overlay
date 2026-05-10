import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeOpacity,
} from "../../../domain/opacity.js";

// Class-a: opacity is a normalized product value, not caller preference. The
// only durable/renderable opacity interval is [0, 1]; finite out-of-range input
// is clamped at the domain boundary, and non-numeric input is rejected before it
// can become application state.
test("opacity normalizes to the product range", () => {
  assert.equal(normalizeOpacity(0), 0);
  assert.equal(normalizeOpacity(0.5), 0.5);
  assert.equal(normalizeOpacity(1), 1);
  assert.equal(normalizeOpacity(-0.25), 0);
  assert.equal(normalizeOpacity(1.25), 1);

  for (const value of [Number.NaN, Infinity, -Infinity, "0.5", null]) {
    assert.throws(
      () => normalizeOpacity(value),
      {
        name: "TypeError",
      },
    );
  }
});
