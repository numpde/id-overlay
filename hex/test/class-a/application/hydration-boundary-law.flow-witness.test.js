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
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-a: hydration is the startup seam where durable plain data enters the
// application. Non-data input is a boundary failure before migration or product
// support policy is allowed to run.
test("hydration rejects non-data durable state", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "hydration rejects non-data durable state",
  });
  assert.equal(
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_DURABLE_STATE,
    "invalid-durable-state",
  );

  assertApplicationBoundaryError(
    () => createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState: new Map(),
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_DURABLE_STATE,
  );
  trace.edge(flowEdge("source.durable-state-input", "inert.boundary-error", {
    terminal: "boundary-error",
  }));
});

function assertApplicationBoundaryError(fn, code) {
  assert.throws(
    fn,
    (error) => (
      error instanceof ApplicationBoundaryError
        && error.name === "ApplicationBoundaryError"
        && error.code === code
    ),
  );
}
