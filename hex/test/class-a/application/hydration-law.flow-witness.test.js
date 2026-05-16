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

// Class-a: no durable input is a pure startup canonicalization. It must produce
// the empty application state and no effects; loading nothing is not a use case.
test("hydrating no durable state returns canonical empty state with no effects", () => {
  const trace = createHydrationTrace("hydrating no durable state returns canonical empty state with no effects");

  for (const durableState of [null, {}]) {
    const result = handleApplicationCommand({
      state: createInitialApplicationState(),
      command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
        durableState,
      }),
    });

    assert.deepEqual(result, {
      state: {},
      effects: [],
    });
  }
  traceHydration(trace, "empty-durable-state", [
    "sink.application-state",
    "inert.no-effects",
  ]);
});

// Class-a: durable session data reconstructs the loaded app state exactly.
// Hydration itself is pure; it must not re-emit persistence for data it just read.
test("hydration restores the declared durable reference-image session", () => {
  const trace = createHydrationTrace("hydration restores the declared durable reference-image session");
  const session = {
    mode: "align",
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state: createInitialApplicationState(),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState: {
        session,
      },
    }),
  }), {
    state: {
      session,
    },
    effects: [],
  });
  traceHydration(trace, "reference-image-session", [
    "sink.application-state",
    "inert.no-effects",
  ]);
});

// Class-a: hydration is replacement from durable input, not a merge. Stale
// prompts, notices, and confirmations from an earlier run must not survive
// once saved session data has been accepted.
test("hydration replaces transient state from durable input", () => {
  const trace = createHydrationTrace("hydration replaces transient state from durable input");
  const session = {
    mode: "align",
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };

  assert.deepEqual(handleApplicationCommand({
    state: {
      referenceImageInput: {
        status: "awaiting-input",
        requestId: 1,
      },
      notice: {
        kind: "reference-image-input-cancelled",
        requestId: 1,
      },
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState: {
        session,
      },
    }),
  }), {
    state: {
      session,
    },
    effects: [],
  });
  traceHydration(trace, "replace-transient-state", [
    "sink.application-state",
    "inert.no-effects",
  ]);
});

// Class-a: durable data is allowed to restore only valid product state.
// Impossible saved image facts and runtime-scoped refs are boundary failures,
// not sessions the app should partially hydrate and repair later.
test("hydration rejects malformed durable reference-image session", () => {
  const trace = createHydrationTrace("hydration rejects malformed durable reference-image session");

  for (const { description, referenceImage } of [
    {
      description: "impossible intrinsic size",
      referenceImage: {
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 0,
          height: 480,
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
      referenceImage: {
        imageDataRef,
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    })),
  ]) {
    const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState: {
        session: {
          mode: "align",
          referenceImage,
        },
      },
    });

    assert.throws(
      () => handleApplicationCommand({
        state: createInitialApplicationState(),
        command,
      }),
      (error) => (
        error instanceof ApplicationBoundaryError
          && error.code === APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_DURABLE_STATE
      ),
      description,
    );
  }
  trace.edge(flowEdge("check.durable-state-boundary", "sink.application-boundary-error", {
    phase: "malformed-durable-reference-image-session",
    terminal: "boundary-rejection",
  }));
});

function createHydrationTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

function traceHydration(trace, phase, sinks) {
  trace.edge(flowEdge("source.durable-state-read", "command.hydrate", {
    phase,
    provider: "application-transition-witness",
  }));
  for (const sink of sinks) {
    trace.edge(flowEdge("command.hydrate", sink, {
      phase,
      terminal: sink === "sink.application-state" ? "state-result" : "effect-result",
    }));
  }
}
