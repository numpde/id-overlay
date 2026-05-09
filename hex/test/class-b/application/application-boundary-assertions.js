import assert from "node:assert/strict";

import { ApplicationBoundaryError } from "../../../application/errors.js";

// Test helper for the application API boundary. Keeping this single predicate
// prevents each product test from redefining what "boundary error" means.
export function assertApplicationBoundaryError(run, expectedCode, message) {
  assert.throws(
    run,
    (error) => (
      error instanceof ApplicationBoundaryError
        && error.name === "ApplicationBoundaryError"
        && error.code === expectedCode
    ),
    message,
  );
}
