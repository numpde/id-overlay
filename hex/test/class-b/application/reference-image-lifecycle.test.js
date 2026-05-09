import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import {
  acceptedReferenceImagePastePayload,
  awaitingReferenceImagePasteState,
  durableStateChangedEffect,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b: accepting the image replaces the pending input flow. Stale notices
// and confirmations must not carry into the new loaded session.
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

// Class-b: clearing the overlay should return to startup posture and request
// durable clearing. This is user-visible behavior, but the exact loaded-session
// fixture and effect vocabulary are still application API shape.
test("clearing the reference image returns to no-session Trace", () => {
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.CLEAR_REFERENCE_IMAGE,
  );

  assertApplicationResult(handleApplicationCommand({
    state: referenceImageLoadedState(),
    command,
  }), {
    state: createInitialApplicationState(),
    effects: [
      durableStateChangedEffect(null),
    ],
  });
});
