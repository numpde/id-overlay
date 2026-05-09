import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../application/command.js";
import {
  ApplicationBoundaryError,
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../application/errors.js";
import { handleApplicationCommand } from "../../application/handle-command.js";
import { assertPlainData } from "./plain-data-assertions.js";
import {
  awaitingReferenceImagePasteState,
  normalizedReferenceImage,
} from "./reference-image-fixtures.js";

// Accepted paste is the positive counterpart to empty/failed paste. The adapter
// has already normalized pixels into a stable data reference plus intrinsic
// size; the application only accepts plain product data.

test("application command vocabulary includes reference image paste outcome", () => {
  assert.equal(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    "report-reference-image-paste-outcome",
  );

  const command = acceptedReferenceImagePasteCommand();

  assertPlainData(command);
  assert.deepEqual(command, {
    kind: "report-reference-image-paste-outcome",
    outcome: {
      kind: "accepted",
      referenceImage: normalizedReferenceImage(),
    },
  });
});

// The command boundary rejects data that has not been normalized into the
// declared reference-image shape. This keeps platform handles and half-decoded
// payloads out of product state.
test("accepted paste outcome requires normalized reference image data", () => {
  assertApplicationBoundaryError(
    () => createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
      {
        outcome: {
          kind: "accepted",
        },
      },
    ),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
  assertApplicationBoundaryError(
    () => createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
      {
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
    ),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
  assertApplicationBoundaryError(
    () => createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
      {
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
    ),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
});

// Accepting the first reference image creates the first durable session. It
// does not place the image on the map yet; placement requires a separate page
// context fact and should not be smuggled into paste acceptance.
test("accepted paste from awaiting state creates the first reference image session", () => {
  const result = handleApplicationCommand({
    state: awaitingReferenceImagePasteState(),
    command: acceptedReferenceImagePasteCommand(),
  });

  assertPlainData(result);
  assert.deepEqual(result, {
    state: {
      session: {
        mode: "align",
        referenceImage: normalizedReferenceImage(),
      },
    },
    effects: [],
  });
});

// Awaiting paste is a transient intent, not durable session data. Once the
// image is accepted, the transient must disappear instead of lingering beside
// the session as a second source of truth.
test("accepted paste clears the awaiting-paste transient", () => {
  const result = handleApplicationCommand({
    state: awaitingReferenceImagePasteState(),
    command: acceptedReferenceImagePasteCommand(),
  });

  assert.equal("referenceImageInput" in result.state, false);
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

function assertApplicationBoundaryError(run, expectedCode) {
  assert.throws(
    run,
    (error) => (
      error instanceof ApplicationBoundaryError
        && error.name === "ApplicationBoundaryError"
        && error.code === expectedCode
    ),
  );
}
