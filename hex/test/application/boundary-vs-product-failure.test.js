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

// This is a principle test that uses the first paste flow as a concrete
// specimen. It is not trying to exhaust the paste UX; it pins the default rule:
// invalid application API input throws, valid negative product outcomes do not.

test("known commands with malformed payloads are boundary errors", () => {
  assertApplicationBoundaryError(
    () => createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
      {
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
        outcome: {
          kind: "failed",
          reason: new Error("adapter leaked a runtime object"),
        },
      },
    ),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
});

// Empty paste is a normal user-world outcome: the user tried to paste, but no
// reference image was available. The application should return product data
// that the UI can show, not throw as if the shell called the API incorrectly.
test("valid empty paste outcome transitions as product data", () => {
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    {
      outcome: {
        kind: "empty",
      },
    },
  );

  const result = handleApplicationCommand({
    state: awaitingReferenceImagePasteState(),
    command,
  });

  assertPlainData(result);
  assert.deepEqual(result, {
    state: {
      notice: {
        kind: "reference-image-paste-empty",
      },
    },
    effects: [],
  });
});

// A failed paste attempt is also a product fact when it arrives as declared
// plain data. The adapter may know the platform details; the application keeps
// only a stable product reason for history, status, and tests.
test("valid failed paste outcome transitions as product data", () => {
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
    {
      outcome: {
        kind: "failed",
        reason: "source-unavailable",
      },
    },
  );

  const result = handleApplicationCommand({
    state: awaitingReferenceImagePasteState(),
    command,
  });

  assertPlainData(result);
  assert.deepEqual(result, {
    state: {
      notice: {
        kind: "reference-image-paste-failed",
        reason: "source-unavailable",
      },
    },
    effects: [],
  });
});

function awaitingReferenceImagePasteState() {
  return {
    referenceImageInput: {
      status: "awaiting-paste",
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
