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
  referenceImageLoadedState,
} from "../../class-b/application/reference-image-fixtures.js";

// Unclassified candidate: selecting the current mode should not create history,
// effects, notices, or new state shape.
test("re-selecting the current loaded mode is a no-op", () => {
  for (const mode of ["align", "trace"]) {
    const state = referenceImageLoadedState({ mode });
    const command = createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode,
    });

    assertApplicationResult(handleApplicationCommand({ state, command }), {
      state,
      effects: [],
    });
  }
});
