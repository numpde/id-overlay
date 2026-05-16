import test from "node:test";
import assert from "node:assert/strict";

import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "./source-files.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-a: the application effect vocabulary is product-level host work. These
// rejected names are known fossils or adapter mechanics; their appearance in
// application source would signal that the app is naming tactics instead of
// product causes.
test("application source contains no forbidden effect vocabulary", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "application source contains no forbidden effect vocabulary",
  });
  const violations = [];
  for (const filePath of listJavaScriptFiles(hexPath("application"))) {
    const source = readSource(filePath);
    for (const forbiddenKind of FORBIDDEN_EFFECT_KINDS) {
      if (source.includes(forbiddenKind)) {
        violations.push(`${relativeToRepo(filePath)} contains ${forbiddenKind}`);
      }
    }
  }

  assert.deepEqual(violations, []);
  trace.edge(flowEdge("check.application-effect-vocabulary", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

const FORBIDDEN_EFFECT_KINDS = Object.freeze([
  "durable-state-changed",
  "read-clipboard-image",
  "schedule-clear-status-notice",
  "schedule-clear-panel-intent",
  "timer-fired",
  "start-manual-paste-capture",
  "cancel-manual-paste-capture",
  "forward-map-gesture",
  "dispatch-pointer-event",
  "release-image-data-ref",
]);
