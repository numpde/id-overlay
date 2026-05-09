import test from "node:test";
import assert from "node:assert/strict";

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
