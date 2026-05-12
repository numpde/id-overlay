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

// Candidate: empty input is a normal user-world outcome. It ends the request,
// leaves no hidden session, and uses source-neutral status vocabulary.
test("candidate: empty reference-image input ends request and schedules status expiry", () => {
  assert.deepEqual(handleApplicationCommand({
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
  }), {
    state: {
      notice: {
        kind: "reference-image-input-empty",
        requestId: 1,
      },
    },
    effects: [{
      kind: EFFECT_KIND.SCHEDULE_CLEAR_STATUS_NOTICE,
      requestId: 1,
      delayMs: STATUS_NOTICE_DELAY_MS,
    }],
  });
});

// Candidate: failed input has a small product taxonomy. Browser-specific causes
// must be normalized by the adapter before crossing into the application.
test("candidate: failed reference-image input uses product failure reasons", () => {
  assert.deepEqual(handleApplicationCommand({
    state: awaitingInputState({ requestId: 1 }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: ACCEPTED_OUTCOME.FAILED,
          reason: FAILURE_REASON.SOURCE_UNAVAILABLE,
        },
      },
    ),
  }), {
    state: {
      notice: {
        kind: "reference-image-input-failed",
        reason: FAILURE_REASON.SOURCE_UNAVAILABLE,
        requestId: 1,
      },
    },
    effects: [{
      kind: EFFECT_KIND.SCHEDULE_CLEAR_STATUS_NOTICE,
      requestId: 1,
      delayMs: STATUS_NOTICE_DELAY_MS,
    }],
  });
});

// Candidate: cancellation is product-owned. The adapter may clean up listeners
// or abort in-flight reads, but late outcomes are ignored because the request id
// no longer belongs to an active application request.
test("candidate: cancelling reference-image input ignores late outcomes", () => {
  const cancelled = handleApplicationCommand({
    state: awaitingInputState({ requestId: 1 }),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  });

  assert.deepEqual(cancelled, {
    state: {
      notice: {
        kind: "reference-image-input-cancelled",
        requestId: 1,
      },
    },
    effects: [{
      kind: EFFECT_KIND.SCHEDULE_CLEAR_STATUS_NOTICE,
      requestId: 1,
      delayMs: STATUS_NOTICE_DELAY_MS,
    }],
  });

  assert.deepEqual(handleApplicationCommand({
    state: cancelled.state,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: ACCEPTED_OUTCOME.ACCEPTED,
          referenceImage: normalizedReferenceImage(),
        },
      },
    ),
  }), {
    state: cancelled.state,
    effects: [],
  });
});

// Candidate: the app supports one active reference-image input request. "Click
// Paste while awaiting input" is Cancel. Retry/Replace would require a distinct
// product command, not another implicit primary-action branch.
test("candidate: primary action while awaiting input cancels instead of replacing", () => {
  const result = handleApplicationCommand({
    state: awaitingInputState({ requestId: 7 }),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION),
  });

  assert.equal(result.state.referenceImageInput, undefined);
  assert.equal(result.state.notice.kind, "reference-image-input-cancelled");
  assert.equal(result.state.notice.requestId, 7);
  assert.equal(result.effects[0].kind, EFFECT_KIND.SCHEDULE_CLEAR_STATUS_NOTICE);
  assert.equal(result.effects[0].requestId, 7);
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
