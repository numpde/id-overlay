import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import {
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b: status clearing is request-bound. An older timeout must not erase a
// newer notice that reached the application after the timeout was scheduled.
test("status clear is request-bound", () => {
  const state = {
    ...referenceImageLoadedState(),
    notice: {
      kind: "reference-image-paste-empty",
      requestId: 2,
    },
  };

  assertApplicationResult(handleApplicationCommand({
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
