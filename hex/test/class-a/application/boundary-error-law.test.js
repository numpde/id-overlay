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

// Class-a: `select-mode` carries only the user's mode intent. A fitted placement
// is a separate product consequence, not a payload smuggled through the mode
// command by an outer layer that would then choose product causality itself.
test("select-mode rejects caller-supplied solved placement", () => {
  assertApplicationBoundaryError(
    () => createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
      mode: "trace",
      solvedPlacement: {
        x: 100,
        y: 200,
        scale: 1,
        rotationRad: 0,
      },
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
});

// Class-a: an accepted reference-image input result must already be usable
// application data.
// Missing image facts, runtime-scoped refs, host handles, and impossible
// dimensions are boundary failures, not product states for the reducer to patch
// up later.
test("accepted reference-image input outcome requires normalized reference image data", () => {
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
    ...[
      "blob:https://www.openstreetmap.org/runtime-only",
      "filesystem:https://www.openstreetmap.org/runtime-only",
      ["c", "hrome-extension://extension-id/runtime-only.png"].join(""),
      ["m", "oz-extension://extension-id/runtime-only.png"].join(""),
    ].map((imageDataRef) => ({
      description: `runtime-scoped image ref: ${imageDataRef}`,
      outcome: {
        kind: "accepted",
        referenceImage: {
          imageDataRef,
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
        },
      },
    })),
    ...[
      "objectUrl",
      "runtimeImageHandle",
      "decodedImageHandle",
      "blobHandle",
    ].map((runtimeField) => ({
      description: `hidden runtime image field: ${runtimeField}`,
      outcome: {
        kind: "accepted",
        referenceImage: {
          imageDataRef: "reference-image-data-1",
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
          [runtimeField]: "runtime-only",
        },
      },
    })),
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
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
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

// Class-a: known command names do not make arbitrary payloads product events.
// Undeclared input outcomes and runtime-object failure reasons are boundary
// failures at both entry points: command construction and reducer handling.
test("malformed reference-image input outcome commands are boundary errors", () => {
  assertApplicationBoundaryError(
    () => createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: "mystery-outcome",
        },
      },
    ),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
  assertApplicationBoundaryError(
    () => createApplicationCommand(
      APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
      {
        requestId: 1,
        outcome: {
          kind: "failed",
          reason: new Error("caller leaked a runtime object"),
        },
      },
    ),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
  assertApplicationBoundaryError(
    () => handleApplicationCommand({
      state: {
        referenceImageInput: {
          status: "awaiting-input",
          requestId: 1,
        },
      },
      command: {
        kind: APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
        requestId: 1,
        outcome: {
          kind: "failed",
          reason: new Error("caller leaked a runtime object"),
        },
      },
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
  assertApplicationBoundaryError(
    () => handleApplicationCommand({
      state: {
        referenceImageInput: {
          status: "awaiting-input",
          requestId: 1,
        },
      },
      command: {
        kind: APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
        requestId: 1,
        outcome: {
          kind: "mystery-outcome",
        },
      },
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
  );
});

// Class-a: input failure reasons are product vocabulary. Source-specific
// mechanics must be normalized before they cross into application commands.
test("source-specific input failure reasons are invalid application commands", () => {
  for (const reason of [
    "clipboard-api-unavailable",
    "clipboard-permission-denied",
    "paste-event-timeout",
    "manual-paste-cancelled",
  ]) {
    assertApplicationBoundaryError(
      () => createApplicationCommand(
        APPLICATION_COMMAND_KIND.REPORT_REFERENCE_IMAGE_INPUT_OUTCOME,
        {
          requestId: 1,
          outcome: {
            kind: "failed",
            reason,
          },
        },
      ),
      APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
      reason,
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
