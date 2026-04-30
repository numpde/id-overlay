import test from "node:test";
import assert from "node:assert/strict";

import {
  INTERACTION_MODE,
  isAlignMode,
  isTraceMode,
  nextMode,
  normalizeInteractionMode,
} from "../../src/core/interaction-mode.js";

test("interaction mode vocabulary and transitions are centralized", () => {
  assert.equal(normalizeInteractionMode(INTERACTION_MODE.ALIGN), INTERACTION_MODE.ALIGN);
  assert.equal(normalizeInteractionMode(INTERACTION_MODE.TRACE), INTERACTION_MODE.TRACE);
  assert.equal(normalizeInteractionMode("anything-else"), INTERACTION_MODE.TRACE);

  assert.equal(nextMode(INTERACTION_MODE.ALIGN), INTERACTION_MODE.TRACE);
  assert.equal(nextMode(INTERACTION_MODE.TRACE), INTERACTION_MODE.ALIGN);

  assert.equal(isAlignMode(INTERACTION_MODE.ALIGN), true);
  assert.equal(isAlignMode(INTERACTION_MODE.TRACE), false);
  assert.equal(isTraceMode(INTERACTION_MODE.TRACE), true);
  assert.equal(isTraceMode(INTERACTION_MODE.ALIGN), false);
});
