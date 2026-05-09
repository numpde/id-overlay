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
