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

// Class-a: history records are semantic replay data, not persisted UI copy.
// Application source may derive view labels from record kind, but durable
// records must not carry literal undo/redo wording that would fossilize copy in
// product state.
test("application source stores no history label fields", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "application source stores no history label fields",
  });
  const violations = [];
  for (const filePath of listJavaScriptFiles(hexPath("application"))) {
    const source = readSource(filePath);
    for (const { label, pattern } of FORBIDDEN_HISTORY_SOURCE_PATTERNS) {
      if (pattern.test(source)) {
        violations.push(`${relativeToRepo(filePath)} contains ${label}`);
      }
    }
  }

  assert.deepEqual(violations, []);
  trace.edge(flowEdge("check.application-history-label-boundary", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

const FORBIDDEN_HISTORY_SOURCE_PATTERNS = Object.freeze([
  {
    label: "stored undo label field",
    pattern: /\bundoLabel\s*:/,
  },
  {
    label: "stored redo label field",
    pattern: /\bredoLabel\s*:/,
  },
]);
