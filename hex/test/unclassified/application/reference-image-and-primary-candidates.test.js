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
  acceptedReferenceImagePastePayload,
  awaitingReferenceImagePasteState,
  durableStateChangedEffect,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "../../class-b/application/reference-image-fixtures.js";

// Unclassified candidate: accepted image should clear stale prompts and notices
// rather than carrying them into the new loaded session.
test("accepted reference image clears pending input notice and panel intent", () => {
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    acceptedReferenceImagePastePayload(),
  );

  assertApplicationResult(handleApplicationCommand({
    state: {
      ...awaitingReferenceImagePasteState(),
      notice: {
        kind: "reference-image-paste-empty",
      },
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command,
  }), {
    state: referenceImageLoadedState(),
    effects: [
      durableStateChangedEffect(referenceImageDurableState()),
    ],
  });
});

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
