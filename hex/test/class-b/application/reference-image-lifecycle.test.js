import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
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
