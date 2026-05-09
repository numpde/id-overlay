import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import {
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../../application/errors.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { assertApplicationBoundaryError } from "./application-boundary-assertions.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import { awaitingReferenceImagePasteState } from "./reference-image-fixtures.js";

// Reference-image paste failures are normal product outcomes when they arrive
// as declared plain data. This file also pins the default boundary rule:
// malformed application API input throws; valid negative product outcomes do not.

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
          reason: new Error("caller leaked a runtime object"),
        },
      },
    ),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
  assertApplicationBoundaryError(
    () => handleApplicationCommand({
      state: awaitingReferenceImagePasteState(),
      command: {
        kind: APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
        outcome: {
          kind: "failed",
          reason: new Error("caller leaked a runtime object"),
        },
      },
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
});

// Empty paste is a normal user-world outcome: the user tried to paste, but no
// reference image was available. The application should return a product notice,
// not throw as if the caller used the API incorrectly.
test("empty paste outcome transitions as product data", () => {
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

  assertApplicationResult(result, {
    state: {
      notice: {
        kind: "reference-image-paste-empty",
      },
    },
    effects: [],
  });
});

// A failed paste attempt is also a product fact when it arrives as declared
// plain data. The caller may know the platform details; the application keeps
// only a stable product reason for history, status, and tests.
test("failed paste outcome transitions as product data", () => {
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

  assertApplicationResult(result, {
    state: {
      notice: {
        kind: "reference-image-paste-failed",
        reason: "source-unavailable",
      },
    },
    effects: [],
  });
});
