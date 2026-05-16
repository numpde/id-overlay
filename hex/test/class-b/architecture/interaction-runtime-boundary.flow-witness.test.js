import test from "node:test";
import assert from "node:assert/strict";

import {
  hexPath,
  readSource,
} from "../../class-a/architecture/source-files.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: the interaction runtime is a mapper, not a second reducer. This is
// a source-level guard over today's file shape, so it is not class-a, but it
// catches a real SSoT break: branching on product state here would duplicate the
// application's transition validity rules.
test("interaction runtime source does not inspect product state", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "interaction runtime source does not inspect product state",
  });
  const source = readSource(hexPath("bootstrap/interaction-runtime.js"));

  assert.deepEqual(
    FORBIDDEN_INTERACTION_RUNTIME_STATE_READS
      .filter(({ pattern }) => pattern.test(source))
      .map(({ label }) => label),
    [],
  );
  trace.edge(flowEdge("check.interaction-runtime-state-boundary", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

const FORBIDDEN_INTERACTION_RUNTIME_STATE_READS = Object.freeze([
  { label: "runtime state reader", pattern: /\bgetState\s*\(/ },
  { label: "application state reader port", pattern: /\breadApplicationState\b/ },
  { label: "view-model selector", pattern: /\bselectApplicationView\b/ },
  // Do not ban payload words like `projection.placement` or `selection.opacity`:
  // those are semantic command values. The smell is reading a product-state
  // object or branching on fields that duplicate transition validity.
  { label: "state object access", pattern: /\bstate\.(session|mode|registration|placement|opacity|history)\b/ },
  { label: "mode-specific branch", pattern: /\b(session|mode|registration|history)\s*[?.]?\./ },
]);
