import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";

// Class-a: with no session, the primary action is Paste. Activating it arms
// reference-image input; the actual image still enters later as correlated data.
test("primary action with no session waits for a pasted reference image", () => {
  const result = handleApplicationCommand({
    state: createInitialApplicationState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assert.deepEqual(result, {
    state: {
      referenceImageInput: {
        status: "awaiting-paste",
        requestId: 1,
      },
    },
    effects: [],
  });
});
