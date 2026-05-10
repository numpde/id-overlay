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

// Class-b, not class-a: exact negative outcome vocabulary can still change, but
// malformed paste outcomes are boundary failures. A known command with an
// undeclared outcome or runtime object payload must be rejected consistently,
// whether it enters through the command factory or the reducer boundary.
test("malformed reference image paste outcome commands are boundary errors", () => {
  assertApplicationBoundaryError(
    () => createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: "mystery-outcome",
        },
      },
    ),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
  assertApplicationBoundaryError(
    () => createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: "failed",
          reason: new Error("caller leaked a runtime object"),
        },
      },
    ),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
  assertApplicationBoundaryError(
    () => handleApplicationCommand({
      state: {
        referenceImageInput: {
          status: "awaiting-paste",
          requestId: 1,
        },
      },
      command: {
        kind: APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
        requestId: 1,
        outcome: {
          kind: "failed",
          reason: new Error("caller leaked a runtime object"),
        },
      },
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
  assertApplicationBoundaryError(
    () => handleApplicationCommand({
      state: {
        referenceImageInput: {
          status: "awaiting-paste",
          requestId: 1,
        },
      },
      command: {
        kind: APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
        requestId: 1,
        outcome: {
          kind: "mystery-outcome",
        },
      },
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
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
