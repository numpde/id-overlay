import test from "node:test";
import assert from "node:assert/strict";

import {
  selectDurableApplicationState,
} from "../../../application/view-model.js";
import {
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";
import {
  movedPlacement,
} from "./placement-fixtures.js";

// Class-b: drag previews may be visible while editing, but only committed
// placement belongs in durable state.
test("transient placement preview is not durable state", () => {
  assert.deepEqual(selectDurableApplicationState({
    ...referenceImageLoadedState(),
    placementPreview: {
      beforePlacement: null,
      previewPlacement: movedPlacement(),
    },
  }), referenceImageDurableState());
});
