import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import {
  ApplicationBoundaryError,
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../../application/errors.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-a: application boundary data stays plain. Commands are inert envelopes,
// not callbacks, host handles, or execution policy; results likewise stay data.
// The only non-plain value here is the thrown Error object, and its exposed
// diagnostics still stay stable strings.

test("application state commands and results are plain data", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "application state commands and results are plain data",
  });
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: null,
  });
  const result = handleApplicationCommand({ state, command });

  assertPlainData(state);
  assertPlainData(command);
  assertPlainData(result);
  trace.edge(flowEdge("check.application-plain-data", "sink.application-boundary", {
    terminal: "boundary-check",
  }));
});

test("application boundary errors expose plain diagnostic fields", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "application boundary errors expose plain diagnostic fields",
  });
  const error = new ApplicationBoundaryError({
    code: APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
    message: "Unknown application command.",
  });

  assert.equal(error.name, "ApplicationBoundaryError");
  assert.equal(typeof error.code, "string");
  assert.equal(typeof error.message, "string");
  trace.edge(flowEdge("check.application-boundary-error", "sink.application-boundary", {
    terminal: "boundary-check",
  }));
});

function assertPlainData(value) {
  if (value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const nestedValue of value) {
      assertPlainData(nestedValue);
    }
    return;
  }

  const valueType = typeof value;
  if (["string", "boolean"].includes(valueType)) {
    return;
  }
  if (valueType === "number") {
    assert.equal(Number.isFinite(value), true);
    return;
  }

  assert.equal(valueType, "object");
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const [key, nestedValue] of Object.entries(value)) {
    assert.equal(typeof key, "string");
    assertPlainData(nestedValue);
  }
}
