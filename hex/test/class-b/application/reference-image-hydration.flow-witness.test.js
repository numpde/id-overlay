import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import {
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../../application/errors.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import {
  assertApplicationBoundaryError,
} from "./application-boundary-assertions.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: unsupported durable data is a durable
// storage boundary failure, not a user-facing product outcome. A future
// migration/version policy may change what gets accepted, but silent hydration
// of undeclared session fields would leak invalid product state.
test("hydration rejects unsupported durable reference-image data", () => {
  const trace = createHydrationBoundaryTrace("hydration rejects unsupported durable reference-image data");
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: {
      session: {
        mode: "align",
        futureField: true,
      },
    },
  });

  assertApplicationBoundaryError(
    () => handleApplicationCommand({
      state: createInitialApplicationState(),
      command,
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_DURABLE_STATE,
  );
  trace.edge(hydrationBoundaryEdge("unsupported-reference-image-data"));
});

// Class-b, deliberately not class-a: this is a current migration-policy guard.
// A future versioning scheme may accept or transform old fields, but accepting
// unknown top-level durable data today would silently choose a data-loss policy.
test("hydration rejects unknown top-level durable fields", () => {
  const trace = createHydrationBoundaryTrace("hydration rejects unknown top-level durable fields");
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: {
      futureField: true,
      nested: {
        value: 1,
      },
    },
  });

  assertApplicationBoundaryError(
    () => handleApplicationCommand({
      state: createInitialApplicationState(),
      command,
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_DURABLE_STATE,
  );
  trace.edge(hydrationBoundaryEdge("unknown-top-level-durable-fields"));
});

function createHydrationBoundaryTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

function hydrationBoundaryEdge(phase) {
  return flowEdge("check.durable-state-boundary", "sink.application-boundary-error", {
    phase,
    terminal: "boundary-rejection",
  });
}
