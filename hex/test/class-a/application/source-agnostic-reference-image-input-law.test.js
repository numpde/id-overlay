import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
} from "../../../application/command.js";

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
