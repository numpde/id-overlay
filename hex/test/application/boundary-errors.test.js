import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../application/command.js";
import {
  ApplicationBoundaryError,
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../application/errors.js";
import { handleApplicationCommand } from "../../application/handle-command.js";
import { assertApplicationBoundaryError } from "./application-boundary-assertions.js";

// Boundary errors are first-class application contract failures. They are stable
// enough for diagnostics, but they are not product facts and must never be
// converted into application state.

test("application boundary error exposes stable identity and code", () => {
  assert.equal(Object.isFrozen(APPLICATION_BOUNDARY_ERROR_CODE), true);
  assert.deepEqual(APPLICATION_BOUNDARY_ERROR_CODE, {
    UNKNOWN_APPLICATION_COMMAND: "unknown-application-command",
    INVALID_APPLICATION_COMMAND: "invalid-application-command",
    INVALID_APPLICATION_STATE: "invalid-application-state",
    INVALID_PERSISTED_STATE: "invalid-persisted-state",
    UNSUPPORTED_PERSISTED_STATE: "unsupported-persisted-state",
  });

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

// The command handler should not infer intent from a partial envelope. Missing
// command data is the same contract failure as an unknown command kind.
test("missing command at the application boundary throws ApplicationBoundaryError", () => {
  assertApplicationBoundaryError(
    () => handleApplicationCommand({ state: {} }),
    APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
  );
});

// State validation belongs at the command boundary. This prevents runtime
// objects from becoming product state through command handling.
test("invalid application state throws ApplicationBoundaryError", () => {
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
  );

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
