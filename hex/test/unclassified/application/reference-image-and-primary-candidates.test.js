import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import {
  assertApplicationResult,
} from "../../class-b/application/application-result-assertions.js";
import {
  awaitingReferenceImagePasteState,
} from "../../class-b/application/reference-image-fixtures.js";

// Unclassified candidate: a stale destructive confirmation must not make the
// primary button destructive when the current state has no image.
test("primary action follows current no-session state despite stale confirmation", () => {
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
  );

  assertApplicationResult(handleApplicationCommand({
    state: {
      ...createInitialApplicationState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command,
  }), {
    state: awaitingReferenceImagePasteState(),
    effects: [],
  });
});
