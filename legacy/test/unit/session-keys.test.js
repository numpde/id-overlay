import test from "node:test";
import assert from "node:assert/strict";

import { placementsEqual } from "../../src/core/session-keys.js";

const PLACEMENT = Object.freeze({
  type: "similarity",
  a: 1,
  b: 0,
  tx: 10,
  ty: 20,
  scale: 1,
  rotationRad: 0,
});

test("placement equality compares canonical similarity components only", () => {
  assert.equal(placementsEqual(PLACEMENT, { ...PLACEMENT, scale: 99, rotationRad: 12 }), true);
  assert.equal(placementsEqual(PLACEMENT, { ...PLACEMENT, tx: 11 }), false);
  assert.equal(placementsEqual(PLACEMENT, null), false);
});
