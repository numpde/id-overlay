import test from "node:test";
import assert from "node:assert/strict";

import { createInitialApplicationState } from "../../../application/state.js";

// Class-c candidate for class-a: the no-session baseline is canonical. Product
// fields appear through use cases, not in startup defaults.

test("initial application state is canonical empty plain data", () => {
  const state = createInitialApplicationState();

  assert.deepEqual(state, {});
});
