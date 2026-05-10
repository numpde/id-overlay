import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  assertApplicationResult,
} from "../../class-b/application/application-result-assertions.js";
import { durableStateChangedEffect } from "./durable-state-fixtures.js";
import {
  firstPin,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-c: the first click asking for clear-pins confirmation was promoted
// because the view model already labels the primary action as Clear pins. The
// second click completing clear-pins remains quarantined until the main-button
// ladder settles.
test("primary action confirms clear-pins when clear-pins confirmation is active", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      pins: [firstPin()],
      panelIntent: {
        kind: "confirm-clear-pins",
      },
    }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: referenceImageLoadedState({
      notice: {
        kind: "cleared-pins",
        count: 1,
      },
    }),
    effects: [
      durableStateChangedEffect(referenceImageDurableState()),
    ],
  });
});
