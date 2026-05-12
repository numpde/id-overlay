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
  acceptedReferenceImageInputPayload,
  normalizedReferenceImage,
} from "./reference-image-fixtures.js";

// Class-b, deliberately not class-a: this is command-factory API shape. Class-a
// owns the behavior: async input outcomes are request-correlated and stale
// results are ignored. This harness only keeps the current command boundary
// from dropping correlation before the command reaches the app.
test("reference-image input outcome command is correlated plain data", () => {
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
    acceptedReferenceImageInputPayload(),
  );

  assertPlainData(command);
  assert.deepEqual(command, {
    kind: APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
    requestId: 1,
    outcome: {
      kind: "accepted",
      referenceImage: normalizedReferenceImage(),
    },
  });
});

// Class-b, deliberately not class-a: class-a owns the empty-input product law.
// This keeps only the current transient notice vocabulary, status-expiry
// request, and correlation id shape used by the panel/status boundary.
test("empty reference-image input outcome becomes a correlated notice", () => {
  assertApplicationResult(handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
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
        kind: "reference-image-input-empty",
        requestId: 1,
      },
    },
    effects: [
      scheduleClearStatusNoticeEffect(1),
    ],
  });
});

function scheduleClearStatusNoticeEffect(requestId) {
  return {
    kind: "schedule-clear-status-notice",
    requestId,
    delayMs: 2500,
  };
}

// Class-b, deliberately not class-a: class-a owns failed input as a normal
// non-durable outcome. This keeps only the current transient notice vocabulary,
// including the data-only reason and the request id used by status correlation.
test("failed reference-image input outcome becomes a correlated notice", () => {
  assertApplicationResult(handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
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
