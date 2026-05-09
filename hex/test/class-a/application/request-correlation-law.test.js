import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: asynchronous input is correlated by request identity. This is
// promoted because a stale host result must never overwrite newer user intent,
// regardless of which adapter produced the result.
test("stale reference-image paste outcomes are ignored", () => {
  const state = {
    referenceImageInput: {
      status: "awaiting-paste",
      requestId: 2,
    },
  };
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    {
      requestId: 1,
      outcome: {
        kind: "accepted",
        referenceImage: {
          imageDataRef: "reference-image-data-1",
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
        },
      },
    },
  );

  assert.deepEqual(handleApplicationCommand({ state, command }), {
    state,
    effects: [],
  });
});

// Class-a: delayed status clearing is also request-correlated. An older clear
// request must not erase a newer notice that reached the app after scheduling.
test("stale status clear requests are ignored", () => {
  const state = {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
    notice: {
      kind: "reference-image-paste-empty",
      requestId: 2,
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.CLEAR_STATUS_NOTICE,
      { requestId: 1 },
    ),
  }), {
    state,
    effects: [],
  });
});
