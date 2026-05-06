import test from "node:test";
import assert from "node:assert/strict";

import { clampOpacity } from "../../src/core/opacity.js";

test("clampOpacity keeps opacity in range", () => {
  assert.equal(clampOpacity(-1), 0);
  assert.equal(clampOpacity(0.5), 0.5);
  assert.equal(clampOpacity(2), 1);
});
