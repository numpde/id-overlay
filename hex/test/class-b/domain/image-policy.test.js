import test from "node:test";
import assert from "node:assert/strict";

import {
  constrainImageSize,
} from "../../../domain/image-policy.js";

// Class-b: pasted images may be larger than the overlay needs, but the app
// should have one canonical working size derived by a pure, aspect-preserving
// policy. Exact product limits remain caller configuration.
test("image policy constrains oversized images by longest side", () => {
  assert.deepEqual(constrainImageSize({
    width: 5000,
    height: 2500,
    maxLongestSide: 2000,
  }), {
    width: 2000,
    height: 1000,
  });
  assert.deepEqual(constrainImageSize({
    width: 640,
    height: 480,
    maxLongestSide: 2000,
  }), {
    width: 640,
    height: 480,
  });
});
