import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  assertApplicationResult,
} from "./application-result-assertions.js";
import { assertPlainData } from "./plain-data-assertions.js";
import {
  acceptedReferenceImagePastePayload,
  normalizedReferenceImage,
} from "./reference-image-fixtures.js";

// Class-b, deliberately not class-a: this is command-factory API shape. Class-a
// owns the behavior: async paste outcomes are request-correlated and stale
// results are ignored. This harness only keeps the current command boundary
// from dropping correlation before the command reaches the app.
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

// Class-b, deliberately not class-a: class-a owns the empty-paste product law
// that no session or durable work is created. This keeps only the current
// transient notice vocabulary and the request id used by status-clearing
// correlation.
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

// Class-b, deliberately not class-a: class-a owns failed paste as a normal
// non-durable outcome. This keeps only the current transient notice vocabulary,
// including the data-only reason and the request id used by status correlation.
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
