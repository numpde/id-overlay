import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-a: application command handling is pure with respect to caller-owned
// input. State and command inputs must survive intact.

test("application command handling does not mutate state or command input", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "application command handling does not mutate state or command input",
  });
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: null,
  });
  const originalState = clonePlainData(state);
  const originalCommand = clonePlainData(command);

  deepFreeze(state);
  deepFreeze(command);

  handleApplicationCommand({ state, command });

  assert.deepEqual(state, originalState);
  assert.deepEqual(command, originalCommand);
  assert.deepEqual(traceArchitectureCheck({
    trace,
    check: "check.application-command-purity",
    sink: "sink.application-command-boundary",
  }), [
    flowEdge("check.application-command-purity", "sink.application-command-boundary", {
      terminal: "architecture-check",
    }),
  ]);
});

function traceArchitectureCheck({ trace, check, sink }) {
  const edges = [
    flowEdge(check, sink, {
      terminal: "architecture-check",
    }),
  ];
  for (const edge of edges) {
    trace.edge(edge);
  }
  assert.deepEqual(trace.edges, edges);
  return edges;
}

function clonePlainData(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  Object.freeze(value);
  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }
  return value;
}
