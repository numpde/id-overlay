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
  durableStateChangedEffect,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "../../class-b/application/reference-image-fixtures.js";

// Unclassified candidate: the loaded image should be able to return from Trace
// to Align as the inverse durable user mode change.
test("switching loaded image from Trace to Align changes mode durably", () => {
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
    mode: "align",
  });

  assertApplicationResult(handleApplicationCommand({
    state: referenceImageLoadedState({ mode: "trace" }),
    command,
  }), {
    state: referenceImageLoadedState({ mode: "align" }),
    effects: [
      durableStateChangedEffect(referenceImageDurableState({ mode: "align" })),
    ],
  });
});

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
