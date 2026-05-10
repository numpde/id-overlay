import test from "node:test";
import assert from "node:assert/strict";

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
} from "./application-boundary-assertions.js";
import {
  assertApplicationResult,
} from "./application-result-assertions.js";
import { assertPlainData } from "./plain-data-assertions.js";
import {
  acceptedReferenceImagePastePayload,
  normalizedReferenceImage,
} from "./reference-image-fixtures.js";

// Class-b, not class-a: this is command-factory API shape. Class-a already owns
// the non-negotiable behavior: async paste outcomes are request-correlated and
// stale results are ignored. This harness only keeps the current factory from
// accidentally dropping that correlation before the command reaches the app.
test("reference image paste outcome command is correlated plain data", () => {
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    acceptedReferenceImagePastePayload(),
  );

  assertPlainData(command);
  assert.deepEqual(command, {
    kind: APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    requestId: 1,
    outcome: {
      kind: "accepted",
      referenceImage: normalizedReferenceImage(),
    },
  });
});

// Class-b, not class-a: exact status copy for an empty paste can still change,
// but "no image was available" is a normal user-world outcome, not a boundary
// failure. The notice keeps the request id so delayed status clearing cannot
// erase a newer message.
test("empty reference image paste outcome becomes a correlated notice", () => {
  assertApplicationResult(handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-paste",
        requestId: 1,
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: "empty",
        },
      },
    ),
  }), {
    state: {
      notice: {
        kind: "reference-image-paste-empty",
        requestId: 1,
      },
    },
    effects: [],
  });
});

// Class-b, not class-a: exact status wording may still change, but a declared
// failed paste is a product fact. The application keeps a stable reason and
// request id; platform-specific failure objects are rejected at the boundary.
test("failed reference image paste outcome becomes a correlated notice", () => {
  assertApplicationResult(handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-paste",
        requestId: 1,
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: "failed",
          reason: "source-unavailable",
        },
      },
    ),
  }), {
    state: {
      notice: {
        kind: "reference-image-paste-failed",
        reason: "source-unavailable",
        requestId: 1,
      },
    },
    effects: [],
  });
});
