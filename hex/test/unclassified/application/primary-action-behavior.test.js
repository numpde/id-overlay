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
  APPLICATION_MODE,
  durableStateChangedEffect,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./user-behavior-fixtures.js";

// Unclassified: confirmations are tied to the current visible intention. A
// different semantic action should clear the confirmation instead of leaving a
// stale destructive second-click armed.
test("unrelated semantic action clears pending clear-image confirmation", () => {
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    }),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: APPLICATION_MODE.TRACE,
    }),
  });

  assertApplicationResult(result, {
    state: referenceImageLoadedState({
      mode: APPLICATION_MODE.TRACE,
    }),
    effects: [
      durableStateChangedEffect(referenceImageDurableState({
        mode: APPLICATION_MODE.TRACE,
      })),
    ],
  });
});
