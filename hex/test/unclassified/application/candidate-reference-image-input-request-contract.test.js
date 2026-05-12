import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Unclassified candidate: this is the desired request contract, not today's
// implementation. The key architectural claim is that a reference-image input
// request is self-contained product causality: the shell should not inspect
// application state to discover whether it is loading the first image or
// replacing an existing one.
test("reference-image input request carries explicit source-neutral intent", () => {
  assert.deepEqual(handleApplicationCommand({
    state: {},
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  }), {
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
        intent: {
          kind: "load-reference-image",
        },
      },
    },
    effects: [{
      kind: "request-reference-image-input",
      requestId: 1,
      intent: {
        kind: "load-reference-image",
      },
    }],
  });
});

// Unclassified candidate: replacement is not a second source-specific path.
// It is the same input lifecycle with a different product intent. Keeping the
// intent on the effect avoids the fossil where bootstrap watches
// `referenceImageInput` or `session` to choose host behavior.
test("replacement input request carries the replacement intent on the effect", () => {
  const state = {
    session: {
      mode: "trace",
      referenceImage: normalizedReferenceImage("old"),
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REQUEST_REFERENCE_IMAGE_REPLACEMENT,
    ),
  }), {
    state: {
      session: state.session,
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
        intent: {
          kind: "replace-reference-image",
        },
      },
    },
    effects: [{
      kind: "request-reference-image-input",
      requestId: 1,
      intent: {
        kind: "replace-reference-image",
      },
    }],
  });
});

function normalizedReferenceImage(label) {
  return {
    imageDataRef: `reference-image-data-${label}`,
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}
