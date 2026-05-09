import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import {
  movedPlacement,
} from "./placement-fixtures.js";
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

// Class-b: Align is the inverse loaded-image user mode. Returning to it is
// equally durable because it changes the saved session posture.
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

// Class-b: changing mode interrupts an in-progress placement preview. The mode
// change is durable; the preview itself is discarded instead of being saved.
test("interrupted placement edit drops preview without changing durable session", () => {
  const state = {
    ...referenceImageLoadedState(),
    placementPreview: {
      beforePlacement: null,
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
