import test from "node:test";
import assert from "node:assert/strict";

import { createInitialApplicationState } from "../../../application/state.js";

// Class-b: the no-session baseline is canonical. Product fields appear through
// use cases, but the exact empty-state shape is still application vocabulary.

test("initial application state is canonical empty plain data", () => {
  const state = createInitialApplicationState();

  assert.deepEqual(state, {});
});
