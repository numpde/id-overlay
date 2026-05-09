import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: hydration is replacement from durable input, not a merge. Stale
// prompts, notices, and confirmations from an earlier run must not survive
// once saved session data has been accepted.
test("hydration replaces transient state from durable input", () => {
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

  assert.deepEqual(handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-paste",
        requestId: 1,
      },
      notice: {
        kind: "reference-image-paste-cancelled",
      },
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState: {
        session,
      },
    }),
  }), {
    state: {
      session,
    },
    effects: [],
  });
});
