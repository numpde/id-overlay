import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  assertApplicationResult,
} from "../../class-b/application/application-result-assertions.js";
import {
  firstPin,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-c: clear-pins-before-clear-image is plausible product behavior, but it
// is still a policy choice for the main button rather than settled architecture.
test("primary action with visible pins requests clear-pins confirmation", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({ pins: [firstPin()] }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: referenceImageLoadedState({
      pins: [firstPin()],
      panelIntent: {
        kind: "confirm-clear-pins",
      },
    }),
    effects: [],
  });
});
