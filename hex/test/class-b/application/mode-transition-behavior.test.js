import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import {
  durableStateChangedEffect,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b: once a reference image exists, Trace is a real user mode. Selecting
// it changes the session and asks the adapter to persist the new durable state.
test("switching loaded image from Align to Trace changes mode durably", () => {
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
    mode: "trace",
  });

  assertApplicationResult(handleApplicationCommand({
    state: referenceImageLoadedState({ mode: "align" }),
    command,
  }), {
    state: referenceImageLoadedState({ mode: "trace" }),
    effects: [
      durableStateChangedEffect(referenceImageDurableState({ mode: "trace" })),
    ],
  });
});
