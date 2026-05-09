import assert from "node:assert/strict";

import { assertPlainData } from "./plain-data-assertions.js";

// Application results must always cross the boundary as plain data. This helper
// keeps that invariant attached to every expected result shape in behavior tests.
export function assertApplicationResult(actualResult, expectedResult) {
  assertPlainData(actualResult);
  assertPlainData(expectedResult);
  assert.deepEqual(actualResult, expectedResult);
}
