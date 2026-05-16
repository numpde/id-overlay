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

// Class-a: the application is a deterministic state transition. Same state plus
// same command must produce the same result.

test("application command handling is deterministic", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "application command handling is deterministic",
  });
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: null,
  });

  const firstResult = handleApplicationCommand({ state, command });
  const secondResult = handleApplicationCommand({ state, command });

  assert.deepEqual(secondResult, firstResult);
  trace.edge(flowEdge("check.application-determinism", "sink.application-state", {
    terminal: "state-result",
  }));
});
