import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import {
  ApplicationBoundaryError,
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../../application/errors.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Unclassified: candidate product law for reference-image input lifecycle.
// The desired shape is intentionally source-agnostic: the application requests a
// reference image and receives a normalized outcome. Clipboard API, paste-event
// fallback, focus management, and listener cleanup are adapter mechanics.
//
// Classification note: the no-session input request candidate was deleted as a
// duplicate of the stronger class-a primary-action law.
//
// Classification note: the accepted-input candidate was deleted as a duplicate
// of the stronger class-a reference-image lifecycle law.
//
// Classification note: the empty-input candidate was deleted as a duplicate of
// the stronger class-a lifecycle law plus class-b notice-shape boundary.
//
// Classification note: the awaiting-input primary-action candidate was deleted
// as a duplicate of the class-a correlated cancellation law.

const COMMAND_KIND = Object.freeze({
  REPORT_REFERENCE_IMAGE_INPUT_OUTCOME: "report-reference-image-input-outcome",
});

const EFFECT_KIND = Object.freeze({
  REQUEST_REFERENCE_IMAGE_INPUT: "request-reference-image-input",
  PERSIST_DURABLE_STATE: "persist-durable-state",
  SCHEDULE_CLEAR_STATUS_NOTICE: "schedule-clear-status-notice",
});

const STATUS_NOTICE_DELAY_MS = 2500;

const ACCEPTED_OUTCOME = Object.freeze({
  ACCEPTED: "accepted",
  EMPTY: "empty",
  FAILED: "failed",
});

const FAILURE_REASON = Object.freeze({
  SOURCE_UNAVAILABLE: "source-unavailable",
  DECODE_FAILED: "decode-failed",
  UNSUPPORTED_IMAGE: "unsupported-image",
});

// Candidate: reject source-specific browser failure vocabulary at the application
// boundary. The adapter can know these terms; product code should not.
test("candidate: browser-specific input failure reasons are invalid application commands", () => {
  for (const reason of [
    "clipboard-api-unavailable",
    "clipboard-permission-denied",
    "paste-event-timeout",
    "manual-paste-cancelled",
  ]) {
    assertApplicationBoundaryError(() => createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: ACCEPTED_OUTCOME.FAILED,
          reason,
        },
      },
    ), APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND);
  }
});

// Candidate: state and notice vocabulary should be source-neutral. This catches
// regressions where "paste" or "clipboard" leaks back into product state.
test("candidate: reference-image input lifecycle emits no paste or clipboard vocabulary", () => {
  const lifecycleResults = [
    handleApplicationCommand({
      state: {},
      command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
    }),
    handleApplicationCommand({
      state: awaitingInputState({ requestId: 1 }),
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
        {
          requestId: 1,
          outcome: {
            kind: ACCEPTED_OUTCOME.EMPTY,
          },
        },
      ),
    }),
    handleApplicationCommand({
      state: awaitingInputState({ requestId: 2 }),
      command: createApplicationCommand(
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
        {
          requestId: 2,
          outcome: {
            kind: ACCEPTED_OUTCOME.FAILED,
            reason: FAILURE_REASON.DECODE_FAILED,
          },
        },
      ),
    }),
  ];

  const serialized = JSON.stringify(lifecycleResults);
  assert.equal(serialized.includes("paste"), false);
  assert.equal(serialized.includes("clipboard"), false);
});

function awaitingInputState({ requestId }) {
  return {
    referenceImageInput: {
      status: "awaiting-input",
      requestId,
    },
  };
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "data:image/png;base64,reference-image",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
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
