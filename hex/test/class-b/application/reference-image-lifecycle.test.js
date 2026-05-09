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

// Class-b: accepted paste should create the first visible session and request
// durability. The user behavior is firm, but exact command/state/effect
// vocabulary is still application API shape.
test("accepted reference image creates an Align session and durability effect", () => {
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    acceptedReferenceImagePastePayload(),
  );

  assertApplicationResult(handleApplicationCommand({
    state: awaitingReferenceImagePasteState(),
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

// Class-b: async adapter results must be request-bound. A stale paste result
// should not overwrite the user's newer application state.
test("stale reference-image paste outcomes are ignored", () => {
  const state = awaitingReferenceImagePasteState({ requestId: 2 });
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    acceptedReferenceImagePastePayload({ requestId: 1 }),
  );

  assertApplicationResult(handleApplicationCommand({ state, command }), {
    state,
    effects: [],
  });
});
