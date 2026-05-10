import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  assertApplicationResult,
} from "../../class-b/application/application-result-assertions.js";
import { durableStateChangedEffect } from "./durable-state-fixtures.js";
import {
  awaitingReferenceImagePasteState,
  normalizedReferenceImage,
  referenceImageDurableState,
  referenceImageSessionState,
} from "./reference-image-fixtures.js";

// Class-c: this remaining test is useful product pressure, not authoritative
// shape. Boundary vocabulary and accepted-image validation were promoted
// separately; this still duplicates first-session details already covered by
// class-a lifecycle tests, so it needs a separate promote/delete decision.

// Accepting the first reference image creates the first durable session and
// reports that durable state changed. The effect carries only durable product
// facts, not pending input, notices, placement, or caller instructions.
test("accepted paste creates the first session and reports durable state change", () => {
  const result = handleApplicationCommand({
    state: awaitingReferenceImagePasteState(),
    command: acceptedReferenceImagePasteCommand(),
  });

  assertApplicationResult(result, {
    state: referenceImageSessionState(),
    effects: [
      durableStateChangedEffect(referenceImageDurableState()),
    ],
  });
});

function acceptedReferenceImagePasteCommand() {
  return createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    {
      requestId: 1,
      outcome: {
        kind: "accepted",
        referenceImage: normalizedReferenceImage(),
      },
    },
  );
}
