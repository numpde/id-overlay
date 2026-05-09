import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeOpacity,
} from "../../../domain/opacity.js";

// Unclassified candidate: opacity is a product value, not an arbitrary slider
// number. The exact clamp/reject policy should be settled before promotion.
test("opacity normalizes to the declared product range", () => {
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
