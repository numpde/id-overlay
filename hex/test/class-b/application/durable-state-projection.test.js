import test from "node:test";
import assert from "node:assert/strict";

import {
  selectDurableApplicationState,
} from "../../../application/view-model.js";
import {
  awaitingReferenceImagePasteState,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";
import {
  movedPlacement,
} from "./placement-fixtures.js";

// Class-b: durable state is the persisted session projection, not the whole
// application object. The exact field vocabulary is still application schema,
// but transient prompts, notices, confirmations, and history must not leak out.
test("durable state excludes input notices panel intent and history", () => {
  const loadedState = referenceImageLoadedState();

  assert.deepEqual(selectDurableApplicationState({
    ...loadedState,
    referenceImageInput: awaitingReferenceImagePasteState().referenceImageInput,
    notice: {
      kind: "reference-image-paste-empty",
    },
    panelIntent: {
      kind: "confirm-clear-reference-image",
    },
    history: {
      past: [{
        kind: "load-reference-image",
      }],
      future: [],
    },
  }), referenceImageDurableState());
});

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
