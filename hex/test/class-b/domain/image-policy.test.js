import test from "node:test";
import assert from "node:assert/strict";

import {
  constrainImageSize,
} from "../../../domain/image-policy.js";

// Class-b: pasted-image normalization should be pure and platform-neutral, but
// the exact sizing policy is still a product choice. This harness protects the
// current aspect-preserving longest-side rule without pretending it is a
// permanent architecture law.
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
