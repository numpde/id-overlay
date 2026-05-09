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
  movedPlacement,
} from "../../class-b/application/placement-fixtures.js";
import {
  referenceImageDurableState,
  referenceImageLoadedState,
} from "../../class-b/application/reference-image-fixtures.js";
import {
  identityPlacement,
} from "../../class-c/application/placement-fixtures.js";
import {
  durableStateChangedEffect,
} from "../../class-c/application/durable-state-fixtures.js";

// Unclassified candidate: abandoning a placement edit should drop preview state
// while preserving the committed durable session.
test("interrupted placement edit drops preview without changing durable session", () => {
  const state = {
    ...referenceImageLoadedState(),
    placementPreview: {
      beforePlacement: identityPlacement(),
      previewPlacement: movedPlacement(),
    },
  };

  assertApplicationResult(handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
    }),
  }), {
    state: referenceImageLoadedState({ mode: "trace" }),
    effects: [
      durableStateChangedEffect(referenceImageDurableState({ mode: "trace" })),
    ],
  });
});
