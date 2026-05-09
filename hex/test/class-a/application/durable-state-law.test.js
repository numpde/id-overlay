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

// Class-a: persistence is a session projection, not an application snapshot.
// This is promoted because prompts, notices, confirmations, and undo history
// are runtime interaction context; resurrecting them after reload is wrong
// regardless of the eventual storage adapter or UI implementation.
test("durable state excludes transient application context", () => {
  const session = {
    mode: "align",
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };

  assert.deepEqual(selectDurableApplicationState({
    session,
    referenceImageInput: {
      status: "awaiting-paste",
      requestId: 1,
    },
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
  }), {
    session,
  });
});

// Class-a: placement preview is a live interaction draft. Only committed
// session placement may be durable; persisting previews would replay a drag that
// the user had not committed.
test("durable state excludes transient placement previews", () => {
  const session = {
    mode: "align",
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };

  assert.deepEqual(selectDurableApplicationState({
    session,
    placementPreview: {
      beforePlacement: null,
      previewPlacement: {
        x: 80,
        y: 40,
        scale: 1,
        rotationRad: 0,
      },
    },
  }), {
    session,
  });
});
