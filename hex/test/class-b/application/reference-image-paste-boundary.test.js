import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import {
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../../application/errors.js";
import {
  assertApplicationBoundaryError,
} from "./application-boundary-assertions.js";
import { assertPlainData } from "./plain-data-assertions.js";
import {
  acceptedReferenceImagePastePayload,
  normalizedReferenceImage,
} from "./reference-image-fixtures.js";

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
    acceptedReferenceImagePastePayload(),
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

// Class-b, not class-a: the exact normalized image record may still grow, but
// accepted paste data must already be platform-free, usable product data before
// it crosses into the application. Missing data, runtime handles, and impossible
// dimensions are caller errors, not product states to recover from later.
test("accepted paste outcome requires normalized reference image data", () => {
  for (const { description, outcome } of [
    {
      description: "missing reference image",
      outcome: {
        kind: "accepted",
      },
    },
    {
      description: "runtime data reference",
      outcome: {
        kind: "accepted",
        referenceImage: {
          imageDataRef: new Map(),
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
        },
      },
    },
    {
      description: "missing intrinsic size",
      outcome: {
        kind: "accepted",
        referenceImage: {
          imageDataRef: "reference-image-data-1",
        },
      },
    },
    {
      description: "impossible intrinsic size",
      outcome: {
        kind: "accepted",
        referenceImage: {
          imageDataRef: "reference-image-data-1",
          intrinsicSizePx: {
            width: 0,
            height: 480,
          },
        },
      },
    },
  ]) {
    assertApplicationBoundaryError(
      () => createApplicationCommand(
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
        {
          requestId: 1,
          outcome,
        },
      ),
      APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
      description,
    );
  }
});
