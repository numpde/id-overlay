import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import {
  awaitingReferenceImagePasteState,
} from "./reference-image-fixtures.js";

// Class-b: the primary action is the UI's semantic button. Adapters report the
// user intent; the application decides that no-session activation waits for a
// pasted reference image.
test("primary action with no session waits for a pasted reference image", () => {
  const result = handleApplicationCommand({
    state: createInitialApplicationState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: awaitingReferenceImagePasteState(),
    effects: [],
  });
});

// Class-b: while paste is armed, the same semantic button cancels the prompt
// instead of starting an overlapping input flow. Exact notice vocabulary remains
// application API shape.
test("primary action while awaiting paste cancels the pending paste prompt", () => {
  const result = handleApplicationCommand({
    state: awaitingReferenceImagePasteState(),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: {
      notice: {
        kind: "reference-image-paste-cancelled",
      },
    },
    effects: [],
  });
});
