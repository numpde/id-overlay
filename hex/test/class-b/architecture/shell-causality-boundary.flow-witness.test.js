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
// over today's browser entrypoint layout. It catches the bad shape where page
// content code watches product fields and performs host work. The application
// shell may still use honest state vocabulary until that god boundary is split;
// this guard must not incentivize hiding field names behind string tricks.
test("browser entrypoint source does not watch product fields to perform host work", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser entrypoint source does not watch product fields to perform host work",
  });
  const violations = [];
  for (const filePath of [
    hexPath("bootstrap/extension-content.js"),
    ...listJavaScriptFiles(repoPath("src/content")),
  ]) {
    const source = withoutStringsAndComments(readSource(filePath));
    const mentionedFields = SHELL_WATCHED_PRODUCT_FIELDS
      .filter((field) => watchesProductField(source, field));
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

function watchesProductField(source, field) {
  const escapedField = escapeRegExp(field);
  return [
    new RegExp(`\\bif\\s*\\([^)]*\\b${escapedField}\\b`),
    new RegExp(`\\bwhile\\s*\\([^)]*\\b${escapedField}\\b`),
    new RegExp(`\\bfor\\s*\\([^)]*\\b${escapedField}\\b`),
    new RegExp(`\\b(?:addEventListener|observe|subscribe)\\s*\\([^)]*\\b${escapedField}\\b`),
  ].some((pattern) => pattern.test(source));
}

function withoutStringsAndComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n\r]*/g, "")
    .replace(/(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g, "\"\"");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
