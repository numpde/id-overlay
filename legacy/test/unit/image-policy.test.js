import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_WORKING_IMAGE_DIMENSION,
  resolveWorkingImageDimensions,
} from "../../src/core/image-policy.js";

test("working image dimensions stay unchanged when already within budget", () => {
  assert.deepEqual(resolveWorkingImageDimensions({
    width: 1600,
    height: 900,
    maxDimension: MAX_WORKING_IMAGE_DIMENSION,
  }), {
    width: 1600,
    height: 900,
    scaleFromOriginal: 1,
    wasResized: false,
  });
});

test("working image dimensions are constrained by the longest side", () => {
  const result = resolveWorkingImageDimensions({
    width: 5000,
    height: 2500,
    maxDimension: 2048,
  });

  assert.equal(result.width, 2048);
  assert.equal(result.height, 1024);
  assert.equal(result.wasResized, true);
  assert.equal(result.scaleFromOriginal, 2048 / 5000);
});
