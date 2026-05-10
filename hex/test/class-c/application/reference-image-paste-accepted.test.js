import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import {
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../../application/errors.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  assertApplicationBoundaryError,
} from "../../class-b/application/application-boundary-assertions.js";
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

// Class-c: these remaining tests are useful product pressure, not authoritative
// shape. The command vocabulary check was promoted separately after correcting
// it to require request correlation; these tests still encode unsettled payload
// validation and first-session details.

// The command boundary rejects data that has not been normalized into the
// declared reference-image shape. This keeps platform handles, missing data, and
// geometrically impossible images out of product state.
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
          outcome,
        },
      ),
      APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
      description,
    );
  }
});

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
      outcome: {
        kind: "accepted",
        referenceImage: normalizedReferenceImage(),
      },
    },
  );
}
