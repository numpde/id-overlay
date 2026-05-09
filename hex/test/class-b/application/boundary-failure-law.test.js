import test from "node:test";
import assert from "node:assert/strict";

import {
  ApplicationBoundaryError,
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../../application/errors.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";

// Class-b candidate for class-a: malformed boundary input is a contract
// failure. It must throw a boundary error instead of becoming product state.

test("malformed application boundary input throws boundary error", () => {
  assert.throws(
    () => handleApplicationCommand({ state: {} }),
    (error) => (
      error instanceof ApplicationBoundaryError
        && error.name === "ApplicationBoundaryError"
        && error.code === APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND
    ),
  );
});
