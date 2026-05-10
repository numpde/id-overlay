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

// Class-a: boundary errors are first-class application contract failures. API
// misuse is not a recoverable product event and must not be converted into
// application state.

test("application boundary error exposes stable identity and code", () => {
  assert.equal(Object.isFrozen(APPLICATION_BOUNDARY_ERROR_CODE), true);
  assert.equal(
    APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
    "unknown-application-command",
  );
  assert.equal(
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_STATE,
    "invalid-application-state",
  );

  const error = new ApplicationBoundaryError({
    code: APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
    message: "Unknown application command.",
  });

  assert.equal(error.name, "ApplicationBoundaryError");
  assert.equal(
    error.code,
    APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
  );
  assert.equal(error instanceof Error, true);
});

// Command validation is the first application gate. Unknown command names are
// not recoverable product events; they mean the caller used an undeclared API.
test("unknown commands throw ApplicationBoundaryError", () => {
  assertApplicationBoundaryError(
    () => handleApplicationCommand({ state: {} }),
    APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
  );
  assertApplicationBoundaryError(
    () => createApplicationCommand("unknown-command"),
    APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
  );
  assertApplicationBoundaryError(
    () => handleApplicationCommand({
      state: {},
      command: { kind: "unknown-command" },
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
  );
});

// Declared commands still have boundary contracts. Malformed payloads are API
// misuse, not product states to recover from inside the reducer.
test("known commands with malformed payloads throw ApplicationBoundaryError", () => {
  assertApplicationBoundaryError(
    () => createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: new Map(),
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
});

// Class-a: an accepted paste result must already be usable application data.
// Missing image facts, host handles, and impossible dimensions are boundary
// failures, not product states for the reducer to patch up later.
test("accepted paste outcome requires normalized reference image data", () => {
  for (const { description, outcome } of [
    {
      description: "missing reference image",
      outcome: {
        kind: "accepted",
      },
    },
    {
      description: "runtime data reference",
      outcome: {
        kind: "accepted",
        referenceImage: {
          imageDataRef: new Map(),
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
        },
      },
    },
    {
      description: "missing intrinsic size",
      outcome: {
        kind: "accepted",
        referenceImage: {
          imageDataRef: "reference-image-data-1",
        },
      },
    },
    {
      description: "impossible intrinsic size",
      outcome: {
        kind: "accepted",
        referenceImage: {
          imageDataRef: "reference-image-data-1",
          intrinsicSizePx: {
            width: 0,
            height: 480,
          },
        },
      },
    },
  ]) {
    assertApplicationBoundaryError(
      () => createApplicationCommand(
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_PASTE_OUTCOME,
        {
          requestId: 1,
          outcome,
        },
      ),
      APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
      description,
    );
  }
});

// State validation belongs at the command boundary. This prevents runtime
// objects from becoming product state through command handling.
test("invalid application state throws ApplicationBoundaryError", () => {
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: null,
  });

  assertApplicationBoundaryError(
    () => handleApplicationCommand({ command }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_STATE,
  );
  assertApplicationBoundaryError(
    () => handleApplicationCommand({
      state: new Map(),
      command,
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_STATE,
  );
});

function assertApplicationBoundaryError(fn, code, message) {
  assert.throws(
    fn,
    (error) => (
      error instanceof ApplicationBoundaryError
        && error.name === "ApplicationBoundaryError"
        && error.code === code
    ),
    message,
  );
}
