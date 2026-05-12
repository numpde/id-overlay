import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-c: this is the desired request contract, not today's class-a behavior.
// The architectural claim is strong: a reference-image input request should be
// self-contained product causality, so the shell never inspects application
// state to discover whether it is loading or replacing.
//
// Decision: keep quarantined. Promoting this requires revising initial-input
// class-a law and the effect shape together; doing only this file would create
// contradictory authority.
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

// Class-c: replacement is the same input lifecycle with a different product
// intent, but current class-a behavior stores that intent in state only. The
// effect-intent part stays quarantined until the whole request contract moves.
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
