import test from "node:test";
import assert from "node:assert/strict";

import { createInitialApplicationState } from "../../../application/state.js";
import {
  selectDurableApplicationState,
} from "../../../application/view-model.js";

// Class-a: pending user input is runtime application state, not durable session
// state. Reloading the extension must not resurrect an old paste prompt.
test("transient reference-image input is not durable state", () => {
  assert.equal(
    selectDurableApplicationState({
      referenceImageInput: {
        status: "awaiting-paste",
        requestId: 1,
      },
    }),
    null,
  );
});

// Class-a: durable state is a saved session, not a dump of the current app
// object. Startup with no reference image has nothing to persist.
test("application with no reference image has no durable state", () => {
  assert.equal(
    selectDurableApplicationState(createInitialApplicationState()),
    null,
  );
});
