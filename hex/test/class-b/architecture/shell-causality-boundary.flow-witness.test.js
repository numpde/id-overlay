import test from "node:test";
import assert from "node:assert/strict";

import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
  repoPath,
} from "../../class-a/architecture/source-files.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: the principle is class-a, but this is still a source-level heuristic
// over today's shell layout. It catches the bad shape where bootstrap/content
// watches product fields and performs host work, while leaving room to replace
// the scan with a stronger wiring contract once the shell boundary settles.
test("shell source does not watch product fields to perform host work", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "shell source does not watch product fields to perform host work",
  });
  const violations = [];
  for (const filePath of [
    ...listJavaScriptFiles(hexPath("bootstrap")),
    ...listJavaScriptFiles(repoPath("src/content")),
  ]) {
    const source = readSource(filePath);
    const mentionedFields = SHELL_WATCHED_PRODUCT_FIELDS
      .filter((field) => source.includes(field));
    const mentionedActions = SHELL_WATCHER_ACTIONS
      .filter((action) => source.includes(action));

    if (mentionedFields.length > 0 && mentionedActions.length > 0) {
      violations.push([
        relativeToRepo(filePath),
        `fields: ${mentionedFields.join(", ")}`,
        `actions: ${mentionedActions.join(", ")}`,
      ].join(" | "));
    }
  }

  assert.deepEqual(violations, []);
  trace.edge(flowEdge("check.shell-causality-boundary", "sink.architecture-boundary", {
    phase: "no-product-field-watchers",
    terminal: "source-contract",
  }));
});

const SHELL_WATCHED_PRODUCT_FIELDS = Object.freeze([
  "referenceImageInput",
  "panelIntent",
  "notice",
  "history",
  "registration",
  "placement",
  "opacity",
]);

const SHELL_WATCHER_ACTIONS = Object.freeze([
  "readReferenceImage",
  "startManualPaste",
  "startManualPasteCapture",
  "cancelManualPaste",
  "cancelManualPasteCapture",
  "startTimer",
  "cancelTimer",
  "releaseImageDataRef",
  "solveRegistrationPlacement",
]);
