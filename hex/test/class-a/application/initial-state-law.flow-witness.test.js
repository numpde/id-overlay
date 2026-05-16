import test from "node:test";
import assert from "node:assert/strict";

import { createInitialApplicationState } from "../../../application/state.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-a: no-session startup is absence of product state, not a bag of
// default inactive flags. Fields enter the state only when a use case creates
// them, which keeps selectors and persistence from guessing at placeholders.
test("initial application state is canonical empty plain data", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "initial application state is canonical empty plain data",
  });
  const state = createInitialApplicationState();

  assert.deepEqual(state, {});
  trace.edge(flowEdge("source.application-startup", "sink.application-state", {
    terminal: "state-result",
  }));
});
