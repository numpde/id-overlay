import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
} from "../../../application/command.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-a: application commands are replayable product intents/facts. Source
// tactics, raw input events, and execution mechanisms belong outside the
// command vocabulary so recorded commands do not depend on one adapter strategy.
test("application command vocabulary is semantic and source-agnostic", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "application command vocabulary is semantic and source-agnostic",
  });
  const commandKinds = Object.values(APPLICATION_COMMAND_KIND);
  const violations = [
    ...REQUIRED_PRODUCT_COMMAND_KINDS
      .filter((kind) => !commandKinds.includes(kind))
      .map((kind) => `missing required command kind: ${kind}`),
    ...commandKinds.flatMap((kind) => (
      FORBIDDEN_COMMAND_KIND_PATTERNS
        .filter((pattern) => pattern.test(kind))
        .map((pattern) => `${kind} matches ${pattern}`)
    )),
  ];

  trace.edge(flowEdge(
    "check.application-command-vocabulary",
    "sink.architecture-command-boundary",
    {
      terminal: "architecture-check",
    },
  ));
  assert.deepEqual(violations, []);
  assert.deepEqual(trace.edges, [
    flowEdge("check.application-command-vocabulary", "sink.architecture-command-boundary", {
      terminal: "architecture-check",
    }),
  ]);
});

const REQUIRED_PRODUCT_COMMAND_KINDS = Object.freeze([
  "activate-primary-action",
  "toggle-registration-pin",
  "commit-placement-edit",
  "center-overlay-in-view",
  "set-opacity",
  "set-temporary-input-posture",
  "report-reference-image-input-outcome",
  "clear-status-notice",
  "clear-panel-intent",
]);

const FORBIDDEN_COMMAND_KIND_PATTERNS = Object.freeze([
  // Browser mechanics describe how an adapter observed input. Application
  // commands name the replayable product intent/fact after that observation has
  // crossed the interaction boundary.
  /\bpaste\b/,
  /\bclipboard\b/,
  /\bclick\b/,
  /\bmouse\b/,
  /\bpointer\b/,
  /\bwheel\b/,
  /\bdrag\b/,
  /\bgesture\b/,
  /\bkeydown\b/,
  /\bkeyup\b/,
  /\bevent\b/,
  /\bdom\b/,
  /\btimer\b/,
  /\bstorage\b/,
  /\bchrome\b/,
  /\bbrowser\b/,
]);
