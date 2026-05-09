import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeOpacity,
} from "../../../domain/opacity.js";

// Class-b: opacity is a bounded product value. The domain accepts finite
// numeric input and returns a value inside the product interval.
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
