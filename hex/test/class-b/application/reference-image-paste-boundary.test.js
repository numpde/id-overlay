import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { assertPlainData } from "./plain-data-assertions.js";

// Class-b, not class-a: the exact command vocabulary is still application API
// shape, but paste outcomes crossing the boundary must be request-correlated.
// This promotes the non-regret part of the class-c candidate and rejects its
// older no-request-id shape, which contradicted the promoted correlation law.
test("reference image paste outcome command is correlated plain data", () => {
  assert.equal(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    "report-reference-image-paste-outcome",
  );

  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    {
      requestId: 1,
      outcome: {
        kind: "accepted",
        referenceImage: normalizedReferenceImage(),
      },
    },
  );

  assertPlainData(command);
  assert.deepEqual(command, {
    kind: "report-reference-image-paste-outcome",
    requestId: 1,
    outcome: {
      kind: "accepted",
      referenceImage: normalizedReferenceImage(),
    },
  });
});

function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}
