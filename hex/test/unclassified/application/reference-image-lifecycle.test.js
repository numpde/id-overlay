import test from "node:test";
import assert from "node:assert/strict";

import {
  selectDurableApplicationState,
} from "../../../application/view-model.js";
import {
  awaitingReferenceImagePasteState,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./user-behavior-fixtures.js";

// Unclassified: pending input is application runtime state. Persisting it would
// resurrect stale paste prompts after reload and blur durable/session ownership.
test("transient reference-image input is not durable state", () => {
  assert.equal(
    selectDurableApplicationState(awaitingReferenceImagePasteState()),
    null,
  );
  assert.deepEqual(
    selectDurableApplicationState(referenceImageLoadedState()),
    referenceImageDurableState(),
  );
});
