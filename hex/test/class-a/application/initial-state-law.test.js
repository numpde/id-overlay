import test from "node:test";
import assert from "node:assert/strict";

import { createInitialApplicationState } from "../../../application/state.js";

// Class-a: no-session startup is absence of product state, not a bag of
// default inactive flags. Fields enter the state only when a use case creates
// them, which keeps selectors and persistence from guessing at placeholders.
test("initial application state is canonical empty plain data", () => {
  const state = createInitialApplicationState();

  assert.deepEqual(state, {});
});
