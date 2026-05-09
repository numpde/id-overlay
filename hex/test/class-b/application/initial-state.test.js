import test from "node:test";
import assert from "node:assert/strict";

import { createInitialApplicationState } from "../../../application/state.js";
import { assertPlainData } from "./plain-data-assertions.js";

// The initial state is the no-session baseline. Product fields should appear
// only after a use case actually needs them.

test("initial application state is plain data", () => {
  const state = createInitialApplicationState();

  assertPlainData(state);
  assert.deepEqual(state, {});
});
