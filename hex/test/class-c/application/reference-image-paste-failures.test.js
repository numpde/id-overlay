import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  assertApplicationResult,
} from "../../class-b/application/application-result-assertions.js";
import { awaitingReferenceImagePasteState } from "./reference-image-fixtures.js";

// Class-c: these remaining negative paste outcomes are plausible product
// behavior, but the exact notice vocabulary is not settled enough to treat as
// design bedrock. Malformed paste payloads were promoted separately as boundary
// errors after correcting them to include request correlation.

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
