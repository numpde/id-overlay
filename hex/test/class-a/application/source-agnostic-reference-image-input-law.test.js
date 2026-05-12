import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-a: the application API receives a normalized reference-image input
// outcome, not a source-specific outcome. Paste is one adapter route; making it
// the product command name would bake an input tactic into every caller,
// history replay, and future non-clipboard input path.
test("reference-image input outcome command is source-agnostic", () => {
  assert.equal(
    APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
    "report-reference-image-input-outcome",
  );
  assert.equal(
    Object.values(APPLICATION_COMMAND_KIND).includes("report-reference-image-paste-outcome"),
    false,
  );
});

// Class-a: source neutrality is not just command naming. The state/effects
// emitted by the input lifecycle must not leak paste or clipboard vocabulary;
// those are adapter tactics, not product facts.
test("reference-image input lifecycle emits no paste or clipboard vocabulary", () => {
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
            kind: "empty",
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
            kind: "failed",
            reason: "decode-failed",
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
